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
use Illuminate\Support\Facades\DB;

// Trang admin Cuốc Free: danh sách/bật-tắt nhóm Zalo, người bắn (chặn/bỏ chặn), tình trạng service.
class FreeRideAdminController extends Controller
{
    private const PAGE_SIZE = 50;

    // Số nhóm Zalo trả về mỗi người bắn (client hiện 3 + "+N" theo groups_count).
    private const SENDER_GROUPS_LIMIT = 10;

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
        // where() giới hạn quét trong 7 ngày gần nhất: hàng cũ hơn đều cho rides_24h=rides_7d=0 nên
        // loại trước (không ảnh hưởng kết quả), chỉ để MySQL khỏi gộp (GROUP BY) toàn bộ lịch sử.
        $rideStats = FreeRide::query()
            ->where('posted_at', '>=', now()->subDays(7))
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

    /**
     * Người bắn gộp theo HỒ SƠ (free_rides.qr_code) — Zalo cấp uid khác nhau cho cùng một người tuỳ
     * nick phụ nào thấy họ, nên mã QR mới là danh tính thật. Mỗi hàng cộng dồn số liệu mọi uid của
     * hồ sơ. Hàng chặn kiểu cũ theo uid mà không còn cuốc nào (không suy ra được qr_code) hiện riêng
     * ở danh sách blocked=1 với qr_code = null.
     */
    public function senders(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'blocked' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $like = ! empty($data['q']) ? '%'.addcslashes($data['q'], '%_\\').'%' : null;
        $page = $this->sendersQuery(now(), now()->subDays(7), $like, $request->boolean('blocked'))
            ->paginate(self::PAGE_SIZE);

        $rows = collect($page->items());
        $details = $this->profileDetails($rows->pluck('qr_code')->filter()->values()->all());
        $uidNames = $this->uidNames($rows->whereNull('qr_code')->pluck('legacy_uid')->filter()->values()->all());

        return response()->json([
            'data' => $rows->map(fn ($row) => $this->formatSender($row, $details, $uidNames))->values(),
            'meta' => $this->meta($page),
        ]);
    }

    // Chặn theo hồ sơ: mọi uid có cùng mã QR (kể cả uid mới chưa từng thấy) đều bị ẩn.
    public function blockProfile(Request $request, string $qrCode): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);
        $this->storeProfileBlock($qrCode, $data['reason'] ?? null, $request->user()->id);

        return response()->json(['blocked' => true]);
    }

    public function unblockProfile(string $qrCode): JsonResponse
    {
        $this->deleteProfileBlocks($qrCode);

        return response()->json(['blocked' => false]);
    }

    // Tương thích ngược (theo sender_uid): còn cuốc thì quy về hồ sơ (qr_code của cuốc mới nhất),
    // không còn cuốc nào thì chặn theo uid như cũ.
    public function block(Request $request, string $senderUid): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:255']]);

        $qrCode = FreeRide::where('sender_uid', $senderUid)->orderByDesc('posted_at')->orderByDesc('id')->value('qr_code');
        if ($qrCode !== null) {
            $this->storeProfileBlock($qrCode, $data['reason'] ?? null, $request->user()->id);
        } else {
            // updateOrCreate làm thao tác idempotent: gọi lại không lỗi, chỉ cập nhật lý do/người chặn.
            ZaloSenderBlock::updateOrCreate(
                ['sender_uid' => $senderUid],
                ['reason' => $data['reason'] ?? null, 'blocked_by' => $request->user()->id],
            );
        }

        return response()->json(['blocked' => true]);
    }

    public function unblock(string $senderUid): JsonResponse
    {
        ZaloSenderBlock::where('sender_uid', $senderUid)->delete();
        // Cuốc tài xế đăng (gca_<id>) không có qr_code.
        FreeRide::where('sender_uid', $senderUid)->whereNotNull('qr_code')->distinct()->pluck('qr_code')
            ->each(fn (string $qrCode) => $this->deleteProfileBlocks($qrCode));

        return response()->json(['blocked' => false]);
    }

    public function status(ZaloServiceMonitor $monitor): JsonResponse
    {
        return response()->json([
            'services' => $monitor->snapshot(),
            // excludingLiveDuplicates(): bản trùng (duplicate_of_id) của một cuốc gốc còn sống không
            // được đếm thêm — khớp ngữ nghĩa "hiển thị" của scopeVisibleTo (xem FreeRide::scopeExcludingLiveDuplicates).
            // whereNull(closed_at): cuốc tài xế đăng đã "Đã có xe" / Xoá không còn hiện ở tab Free.
            'active_rides' => FreeRide::where('expires_at', '>', now())->whereNull('closed_at')->excludingLiveDuplicates()->count(),
            'groups_enabled' => ZaloGroup::whereNull('left_at')->where('enabled', true)->count(),
            // Chỉ đếm nhóm chưa rời — nhóm đã rời không còn được service theo dõi.
            'groups_total' => ZaloGroup::whereNull('left_at')->count(),
        ]);
    }

    private function storeProfileBlock(string $qrCode, ?string $reason, int $adminId): void
    {
        // updateOrCreate làm thao tác idempotent: gọi lại không lỗi, chỉ cập nhật lý do/người chặn.
        ZaloSenderBlock::updateOrCreate(['qr_code' => $qrCode], ['reason' => $reason, 'blocked_by' => $adminId]);
    }

    // Bỏ chặn hồ sơ: xoá hàng theo qr_code VÀ hàng chặn kiểu cũ theo bất kỳ uid nào của hồ sơ —
    // nếu không, hồ sơ vẫn còn "Đã chặn" (và một uid vẫn bị ẩn) sau khi admin bấm Bỏ chặn.
    private function deleteProfileBlocks(string $qrCode): void
    {
        ZaloSenderBlock::where('qr_code', $qrCode)
            ->orWhereIn('sender_uid', FreeRide::where('qr_code', $qrCode)->select('sender_uid'))
            ->delete();
    }

    /**
     * Truy vấn danh sách — an toàn với ONLY_FULL_GROUP_BY: mọi GROUP BY nằm trong subquery (mỗi
     * subquery 1 hàng/khoá), truy vấn ngoài chỉ LEFT JOIN nên không nhân dòng, phân trang đếm đúng.
     *  k  : khoá hàng — (qr_code, legacy_uid). Mặc định: mọi qr_code có cuốc + uid của cuốc không có qr_code
     *       (cuốc tài xế đăng, gca_<id>). blocked=1: qr_code bị chặn (theo mã, hoặc suy từ uid bị chặn kiểu
     *       cũ) + uid bị chặn không có cuốc nào mang qr_code (chặn kiểu cũ hết cuốc, hoặc tài xế đăng).
     *  rs : số cuốc theo qr_code; ru2: số cuốc theo uid (cuốc không có qr_code); rq: báo cáo của mọi uid
     *       thuộc qr_code; ru: báo cáo theo legacy_uid.
     *  bq : qr_code đang bị chặn; bu: uid đang bị chặn (cờ blocked).
     */
    private function sendersQuery(Carbon $now, Carbon $weekAgo, ?string $like, bool $blockedOnly): QueryBuilder
    {
        // Cuốc gộp (cùng nội dung, bất kể người đăng — duplicate_of_id) chỉ đếm một lần, khớp tab Free:
        // bản trùng chỉ được đếm khi cuốc gốc đã mất (c.id NULL) hoặc, với active_rides, đã hết hạn.
        // LEFT JOIN 1-1 theo khoá chính nên không nhân dòng; GROUP BY chỉ theo free_rides.qr_code.
        $rideStats = FreeRide::query()->toBase()
            ->leftJoin('free_rides as c', 'c.id', '=', 'free_rides.duplicate_of_id')
            ->select('free_rides.qr_code')
            ->selectRaw('COUNT(CASE WHEN free_rides.expires_at > ? AND (c.id IS NULL OR c.expires_at <= ?) THEN 1 END) as active_rides', [$now, $now])
            ->selectRaw('COUNT(CASE WHEN free_rides.posted_at >= ? AND c.id IS NULL THEN 1 END) as rides_7d', [$weekAgo])
            ->groupBy('free_rides.qr_code');
        $uidRideStats = FreeRide::query()->toBase()
            ->leftJoin('free_rides as c', 'c.id', '=', 'free_rides.duplicate_of_id')
            ->whereNull('free_rides.qr_code')
            ->select('free_rides.sender_uid')
            ->selectRaw('COUNT(CASE WHEN free_rides.expires_at > ? AND free_rides.closed_at IS NULL AND (c.id IS NULL OR c.expires_at <= ?) THEN 1 END) as active_rides', [$now, $now])
            ->selectRaw('COUNT(CASE WHEN free_rides.posted_at >= ? AND c.id IS NULL THEN 1 END) as rides_7d', [$weekAgo])
            ->groupBy('free_rides.sender_uid');
        $blockedUids = ZaloSenderBlock::query()->toBase()->whereNotNull('sender_uid')->select('sender_uid')->distinct();

        $uidProfiles = FreeRide::query()->toBase()->whereNotNull('qr_code')->select('sender_uid', 'qr_code')->distinct();
        $reportsByQr = FreeRideReport::query()->toBase()
            ->joinSub($uidProfiles, 'up', 'up.sender_uid', '=', 'free_ride_reports.sender_uid')
            ->selectRaw('up.qr_code as qr_code, COUNT(*) as reports')
            ->groupBy('up.qr_code');
        $reportsByUid = FreeRideReport::query()->toBase()
            ->selectRaw('sender_uid, COUNT(*) as reports')
            ->groupBy('sender_uid');

        if ($blockedOnly) {
            $orphanLegacyBlocks = ZaloSenderBlock::query()->toBase()
                ->whereNull('qr_code')->whereNotNull('sender_uid')
                ->whereNotIn('sender_uid', FreeRide::query()->toBase()->whereNotNull('qr_code')->select('sender_uid'))
                ->selectRaw('NULL as qr_code, sender_uid as legacy_uid');
            $keys = DB::query()->fromSub($this->blockedQrCodesQuery(), 'b')
                ->select('b.qr_code')->selectRaw('NULL as legacy_uid')
                ->unionAll($orphanLegacyBlocks);
        } else {
            $keys = FreeRide::query()->toBase()->whereNotNull('qr_code')->select('qr_code')->selectRaw('NULL as legacy_uid')->distinct()
                ->union(FreeRide::query()->toBase()->whereNull('qr_code')->selectRaw('NULL as qr_code, sender_uid as legacy_uid')->distinct());
        }

        $query = DB::query()->fromSub($keys, 'k')
            ->leftJoinSub($rideStats, 'rs', 'rs.qr_code', '=', 'k.qr_code')
            ->leftJoinSub($uidRideStats, 'ru2', 'ru2.sender_uid', '=', 'k.legacy_uid')
            ->leftJoinSub($reportsByQr, 'rq', 'rq.qr_code', '=', 'k.qr_code')
            ->leftJoinSub($reportsByUid, 'ru', 'ru.sender_uid', '=', 'k.legacy_uid')
            ->leftJoinSub($this->blockedQrCodesQuery(), 'bq', 'bq.qr_code', '=', 'k.qr_code')
            ->leftJoinSub($blockedUids, 'bu', 'bu.sender_uid', '=', 'k.legacy_uid')
            ->select('k.qr_code', 'k.legacy_uid')
            ->selectRaw('COALESCE(rs.active_rides, ru2.active_rides, 0) as active_rides')
            ->selectRaw('COALESCE(rs.rides_7d, ru2.rides_7d, 0) as rides_7d')
            ->selectRaw('COALESCE(rq.reports, ru.reports, 0) as reports')
            ->selectRaw('CASE WHEN bu.sender_uid IS NOT NULL OR bq.qr_code IS NOT NULL THEN 1 ELSE 0 END as blocked')
            ->orderByDesc('active_rides')
            ->orderByDesc('rides_7d')
            // Tie-breaker để thứ tự ổn định giữa các trang.
            ->orderBy('k.qr_code')
            ->orderBy('k.legacy_uid');

        if ($like !== null) {
            // Lọc theo khoá hồ sơ khớp BẤT KỲ cuốc nào của hồ sơ (tên/nhóm/uid/mã) — không lọc theo dòng
            // cuốc trước khi đếm — nên khớp tên cũ hay mới đều ra đủ số liệu, không bị đếm thiếu.
            $matchingQr = FreeRide::query()->toBase()
                ->where(fn (QueryBuilder $w) => $w->where('sender_name', 'like', $like)
                    ->orWhere('group_name', 'like', $like)
                    ->orWhere('sender_uid', 'like', $like)
                    ->orWhere('qr_code', 'like', $like))
                ->select('qr_code');
            $matchingUid = FreeRide::query()->toBase()->whereNull('qr_code')
                ->where(fn (QueryBuilder $w) => $w->where('sender_name', 'like', $like)->orWhere('sender_uid', 'like', $like))
                ->select('sender_uid');
            $query->where(fn (QueryBuilder $w) => $w->whereIn('k.qr_code', $matchingQr)
                ->orWhereIn('k.legacy_uid', $matchingUid)
                // Hồ sơ bị chặn đã hết cuốc / chặn kiểu cũ: vẫn tìm được theo mã hoặc uid.
                ->orWhere('k.qr_code', 'like', $like)
                ->orWhere('k.legacy_uid', 'like', $like));
        }

        return $query;
    }

    // qr_code đang bị chặn: chặn trực tiếp theo mã ∪ mã của mọi cuốc có uid bị chặn kiểu cũ (UNION khử trùng).
    private function blockedQrCodesQuery(): QueryBuilder
    {
        $fromLegacyUid = FreeRide::query()->toBase()
            ->join('zalo_sender_blocks', 'zalo_sender_blocks.sender_uid', '=', 'free_rides.sender_uid')
            ->whereNotNull('free_rides.qr_code')
            ->select('free_rides.qr_code');

        return ZaloSenderBlock::query()->toBase()->whereNotNull('qr_code')->select('qr_code')->union($fromLegacyUid);
    }

    /**
     * Chi tiết cho các hồ sơ trong trang hiện tại: một truy vấn gộp theo (qr_code, uid, tên, nhóm)
     * kèm lần đăng gần nhất — số dòng nhỏ (tổ hợp khác nhau), suy ra ở PHP: tên hiển thị (tên
     * không rỗng gần nhất), danh sách uid, nhóm Zalo (gần nhất trước).
     *
     * @param  list<string>  $qrCodes
     * @return array<string, array{sender_name: string, sender_uid: ?string, sender_uids: list<string>, groups: list<string>, groups_count: int}>
     */
    private function profileDetails(array $qrCodes): array
    {
        if ($qrCodes === []) {
            return [];
        }

        $combos = FreeRide::query()->toBase()
            ->whereIn('qr_code', $qrCodes)
            ->select('qr_code', 'sender_uid', 'sender_name', 'group_name')
            ->selectRaw('MAX(posted_at) as last_posted_at')
            ->groupBy('qr_code', 'sender_uid', 'sender_name', 'group_name')
            ->get()
            ->sortByDesc('last_posted_at');

        $details = [];
        foreach ($combos->groupBy('qr_code') as $qrCode => $items) {
            $named = $items->first(fn ($i) => $i->sender_name !== '');
            $groups = $items->filter(fn ($i) => $i->group_name !== '')->pluck('group_name')->unique()->values();
            $details[$qrCode] = [
                'sender_name' => (string) ($named->sender_name ?? ''),
                'sender_uid' => $items->first()->sender_uid,
                'sender_uids' => $items->pluck('sender_uid')->unique()->sort()->values()->all(),
                'groups' => $groups->take(self::SENDER_GROUPS_LIMIT)->all(),
                'groups_count' => $groups->count(),
            ];
        }

        return $details;
    }

    /**
     * Tên hiển thị cho hàng khoá theo uid (cuốc tài xế đăng / chặn kiểu cũ): tên không rỗng gần nhất.
     *
     * @param  list<string>  $uids
     * @return array<string, string>
     */
    private function uidNames(array $uids): array
    {
        if ($uids === []) {
            return [];
        }

        return FreeRide::whereIn('sender_uid', $uids)->where('sender_name', '!=', '')
            ->orderByDesc('posted_at')->get(['sender_uid', 'sender_name'])
            ->unique('sender_uid')->pluck('sender_name', 'sender_uid')->all();
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

    private function formatSender($row, array $details, array $uidNames = []): array
    {
        $d = $row->qr_code !== null ? ($details[$row->qr_code] ?? null) : null;
        $legacyUids = $row->legacy_uid !== null ? [$row->legacy_uid] : [];

        return [
            'qr_code' => $row->qr_code,
            'contact_url' => $row->qr_code !== null ? "zalo://qr/p/{$row->qr_code}" : null,
            'sender_name' => $d['sender_name'] ?? ($row->legacy_uid !== null ? ($uidNames[$row->legacy_uid] ?? '') : ''),
            // uid của cuốc gần nhất (hoặc uid chặn kiểu cũ) — giữ cho client cũ.
            'sender_uid' => $d['sender_uid'] ?? $row->legacy_uid,
            'sender_uids' => $d['sender_uids'] ?? $legacyUids,
            'groups' => $d['groups'] ?? [],
            'groups_count' => $d['groups_count'] ?? 0,
            'active_rides' => (int) $row->active_rides,
            'rides_7d' => (int) $row->rides_7d,
            'reports' => (int) $row->reports,
            'blocked' => (bool) $row->blocked,
        ];
    }
}
