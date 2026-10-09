<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\ZaloGroup;
use App\Models\ZaloSenderBlock;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

// Trang admin Cuốc Free: danh sách/bật-tắt nhóm Zalo, người bắn (chặn/bỏ chặn), tình trạng service.
class FreeRideAdminController extends Controller
{
    private const PAGE_SIZE = 50;

    public function groups(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:enabled,disabled,left,no_rides_7d'],
            'sort' => ['nullable', 'in:rides_7d'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        // Subquery gộp theo zalo_group_id (ONLY_FULL_GROUP_BY-safe: GROUP BY nằm trong subquery,
        // truy vấn ngoài chỉ LEFT JOIN, không GROUP BY) — đếm cuốc 24h/7 ngày mỗi nhóm.
        $rideStats = FreeRide::query()
            ->selectRaw('zalo_group_id')
            ->selectRaw('COUNT(CASE WHEN posted_at >= ? THEN 1 END) as rides_24h', [now()->subHours(24)])
            ->selectRaw('COUNT(CASE WHEN posted_at >= ? THEN 1 END) as rides_7d', [now()->subDays(7)])
            ->groupBy('zalo_group_id')
            ->toBase();

        $query = ZaloGroup::query()
            ->leftJoinSub($rideStats, 'ride_stats', 'ride_stats.zalo_group_id', '=', 'zalo_groups.zalo_group_id')
            ->select('zalo_groups.*')
            ->selectRaw('COALESCE(ride_stats.rides_24h, 0) as rides_24h')
            ->selectRaw('COALESCE(ride_stats.rides_7d, 0) as rides_7d');

        match ($data['status'] ?? null) {
            'enabled' => $query->whereNull('zalo_groups.left_at')->where('zalo_groups.enabled', true),
            'disabled' => $query->whereNull('zalo_groups.left_at')->where('zalo_groups.enabled', false),
            'left' => $query->whereNotNull('zalo_groups.left_at'),
            // Đang bật, chưa rời, không ra cuốc nào trong 7 ngày — gợi ý admin tắt bớt để đỡ chi phí AI.
            'no_rides_7d' => $query->whereNull('zalo_groups.left_at')->where('zalo_groups.enabled', true)
                ->where(fn (Builder $w) => $w->whereNull('ride_stats.rides_7d')->orWhere('ride_stats.rides_7d', 0)),
            // Mặc định: nhóm chưa rời (bật hoặc tắt).
            default => $query->whereNull('zalo_groups.left_at'),
        };

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where('zalo_groups.name', 'like', $like);
        }

        match ($data['sort'] ?? null) {
            'rides_7d' => $query->orderByDesc('rides_7d'),
            default => $query->orderByDesc('zalo_groups.messages_24h'),
        };
        // Tie-breaker cuối để thứ tự ổn định khi nhiều nhóm trùng messages_24h/rides_7d/name.
        $page = $query->orderBy('zalo_groups.name')->orderBy('zalo_groups.zalo_group_id')->paginate(self::PAGE_SIZE);

        return response()->json([
            'data' => collect($page->items())->map(fn (ZaloGroup $g) => $this->formatGroup($g))->values(),
            'meta' => $this->meta($page),
        ]);
    }

    public function toggleGroup(Request $request, string $zaloGroupId): JsonResponse
    {
        $data = $request->validate(['enabled' => ['required', 'boolean']]);

        $group = ZaloGroup::where('zalo_group_id', $zaloGroupId)->firstOrFail();
        $group->update(['enabled' => $data['enabled']]);

        return response()->json($this->formatGroup($group));
    }

    public function senders(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'blocked' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $now = now();
        $weekAgo = $now->copy()->subDays(7);
        $like = ! empty($data['q']) ? '%'.addcslashes($data['q'], '%_\\').'%' : null;

        if ($request->boolean('blocked')) {
            $page = $this->blockedSendersQuery($now, $weekAgo, $like)->paginate(self::PAGE_SIZE);
        } else {
            $page = $this->activeSendersQuery($now, $weekAgo, $like)->paginate(self::PAGE_SIZE);
        }

        return response()->json([
            'data' => collect($page->items())->map(fn ($row) => $this->formatSender($row))->values(),
            'meta' => $this->meta($page),
        ]);
    }

    public function block(Request $request, string $senderUid): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        // updateOrCreate làm thao tác idempotent: gọi lại không lỗi, chỉ cập nhật lý do/người chặn.
        ZaloSenderBlock::updateOrCreate(
            ['sender_uid' => $senderUid],
            ['reason' => $data['reason'] ?? null, 'blocked_by' => $request->user()->id],
        );

        return response()->json(['blocked' => true]);
    }

    public function unblock(string $senderUid): JsonResponse
    {
        ZaloSenderBlock::where('sender_uid', $senderUid)->delete();

        return response()->json(['blocked' => false]);
    }

    public function status(ZaloServiceMonitor $monitor): JsonResponse
    {
        return response()->json([
            'services' => $monitor->snapshot(),
            'active_rides' => FreeRide::where('expires_at', '>', now())->count(),
            'groups_enabled' => ZaloGroup::whereNull('left_at')->where('enabled', true)->count(),
            // Chỉ đếm nhóm chưa rời — nhóm đã rời không còn được service theo dõi.
            'groups_total' => ZaloGroup::whereNull('left_at')->count(),
        ]);
    }

    // Danh sách mặc định: gộp theo free_rides.sender_uid — chỉ người bắn đã từng có cuốc.
    // reports/blocked join vào 1 hàng/sender_uid trước khi group, nên MAX() chỉ lấy đúng giá trị
    // không đổi theo nhóm (không gây đếm trùng active_rides/rides_7d).
    private function activeSendersQuery(Carbon $now, Carbon $weekAgo, ?string $like): Builder
    {
        $reports = $this->reportCountsSubquery();

        $query = FreeRide::query()
            ->leftJoinSub($reports, 'reports', 'reports.sender_uid', '=', 'free_rides.sender_uid')
            ->leftJoin('zalo_sender_blocks', 'zalo_sender_blocks.sender_uid', '=', 'free_rides.sender_uid')
            ->selectRaw('free_rides.sender_uid as sender_uid, MAX(free_rides.sender_name) as sender_name')
            ->selectRaw('COUNT(CASE WHEN free_rides.expires_at > ? THEN 1 END) as active_rides', [$now])
            ->selectRaw('COUNT(CASE WHEN free_rides.posted_at >= ? THEN 1 END) as rides_7d', [$weekAgo])
            ->selectRaw('COALESCE(MAX(reports.reports), 0) as reports')
            ->selectRaw('CASE WHEN MAX(zalo_sender_blocks.sender_uid) IS NOT NULL THEN 1 ELSE 0 END as blocked')
            ->groupBy('free_rides.sender_uid')
            ->orderByDesc('active_rides')
            ->orderByDesc('rides_7d')
            ->orderBy('free_rides.sender_uid');

        if ($like !== null) {
            // Lọc theo sender_uid (cột gộp) khớp với BẤT KỲ cuốc nào của người đó — không phải lọc
            // theo dòng — nên một người bắn đổi tên qua nhiều cuốc, khớp tên cũ hay mới đều ra đủ
            // active_rides/rides_7d/reports (không bị đếm thiếu vì WHERE cắt dòng trước GROUP BY).
            // whereIn trên chính cột GROUP BY nên an toàn với ONLY_FULL_GROUP_BY của MySQL.
            $matchingSenderUids = FreeRide::query()
                ->where(fn (Builder $w) => $w->where('sender_name', 'like', $like)->orWhere('sender_uid', 'like', $like))
                ->select('sender_uid');
            $query->whereIn('free_rides.sender_uid', $matchingSenderUids);
        }

        return $query;
    }

    // blocked=1: nền là zalo_sender_blocks (người bị chặn không còn cuốc vẫn hiện).
    private function blockedSendersQuery(Carbon $now, Carbon $weekAgo, ?string $like): Builder
    {
        $rides = $this->rideStatsSubquery($now, $weekAgo);
        $reports = $this->reportCountsSubquery();

        $query = ZaloSenderBlock::query()
            ->leftJoinSub($rides, 'rides', 'rides.sender_uid', '=', 'zalo_sender_blocks.sender_uid')
            ->leftJoinSub($reports, 'reports', 'reports.sender_uid', '=', 'zalo_sender_blocks.sender_uid')
            ->selectRaw('zalo_sender_blocks.sender_uid as sender_uid')
            ->selectRaw("COALESCE(rides.sender_name, '') as sender_name")
            ->selectRaw('COALESCE(rides.active_rides, 0) as active_rides')
            ->selectRaw('COALESCE(rides.rides_7d, 0) as rides_7d')
            ->selectRaw('COALESCE(reports.reports, 0) as reports')
            ->selectRaw('1 as blocked')
            ->orderByDesc('active_rides')
            ->orderByDesc('rides_7d')
            ->orderBy('zalo_sender_blocks.sender_uid');

        if ($like !== null) {
            $query->where(fn (Builder $w) => $w->where('rides.sender_name', 'like', $like)
                ->orWhere('zalo_sender_blocks.sender_uid', 'like', $like));
        }

        return $query;
    }

    private function rideStatsSubquery(Carbon $now, Carbon $weekAgo): QueryBuilder
    {
        return FreeRide::query()
            ->selectRaw('sender_uid, MAX(sender_name) as sender_name')
            ->selectRaw('COUNT(CASE WHEN expires_at > ? THEN 1 END) as active_rides', [$now])
            ->selectRaw('COUNT(CASE WHEN posted_at >= ? THEN 1 END) as rides_7d', [$weekAgo])
            ->groupBy('sender_uid')
            ->toBase();
    }

    private function reportCountsSubquery(): QueryBuilder
    {
        return FreeRideReport::query()
            ->selectRaw('sender_uid, COUNT(*) as reports')
            ->groupBy('sender_uid')
            ->toBase();
    }

    private function meta(LengthAwarePaginator $page): array
    {
        return [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
        ];
    }

    private function formatGroup(ZaloGroup $g): array
    {
        return [
            'zalo_group_id' => $g->zalo_group_id,
            'name' => $g->name,
            'enabled' => (bool) $g->enabled,
            'member_count' => $g->member_count,
            'messages_24h' => $g->messages_24h,
            'last_message_at' => $g->last_message_at?->getTimestampMs(),
            'accounts' => $g->accounts ?? [],
            'left' => $g->left_at !== null,
            // Chỉ có khi groups() join ride_stats; toggleGroup() trả về ZaloGroup trần → mặc định 0.
            'rides_24h' => (int) ($g->rides_24h ?? 0),
            'rides_7d' => (int) ($g->rides_7d ?? 0),
        ];
    }

    private function formatSender($row): array
    {
        return [
            'sender_uid' => $row->sender_uid,
            'sender_name' => (string) ($row->sender_name ?? ''),
            'active_rides' => (int) $row->active_rides,
            'rides_7d' => (int) $row->rides_7d,
            'reports' => (int) $row->reports,
            'blocked' => (bool) $row->blocked,
        ];
    }
}
