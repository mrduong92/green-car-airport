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
            'status' => ['nullable', 'in:enabled,disabled,left'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = ZaloGroup::query();

        match ($data['status'] ?? null) {
            'enabled' => $query->whereNull('left_at')->where('enabled', true),
            'disabled' => $query->whereNull('left_at')->where('enabled', false),
            'left' => $query->whereNotNull('left_at'),
            // Mặc định: nhóm chưa rời (bật hoặc tắt).
            default => $query->whereNull('left_at'),
        };

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where('name', 'like', $like);
        }

        $page = $query->orderByDesc('messages_24h')->orderBy('name')->paginate(self::PAGE_SIZE);

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
            'groups_total' => ZaloGroup::count(),
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
            ->orderByDesc('rides_7d');

        if ($like !== null) {
            $query->where(fn (Builder $w) => $w->where('free_rides.sender_name', 'like', $like)
                ->orWhere('free_rides.sender_uid', 'like', $like));
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
            ->orderByDesc('rides_7d');

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
