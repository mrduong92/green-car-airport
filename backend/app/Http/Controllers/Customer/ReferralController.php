<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Support\DateBuckets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// F1 của khách: khách đăng ký bằng mã/SĐT của người này. Số liệu chuyến tính theo tháng HOÀN THÀNH
// (completed_at của booking completed, KHÔNG dùng updated_at — xem Admin\ReferralReportController) —
// cùng mốc với hoa hồng được cộng.
class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $legacy = $request->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $hasRange = $request->filled('from') || $request->filled('to') || $request->filled('group');
        $month = $hasRange ? null : ($legacy['month'] ?? null);

        // `month=YYYY-MM` (bản PWA cũ còn cache) = cả tháng đó, gom theo ngày; có from/to/group thì
        // bỏ qua month. Không tham số nào → "Tháng này".
        if ($month) {
            $start = Carbon::createFromFormat('!Y-m', $month, config('app.timezone'))->startOfMonth();
            $range = DateBuckets::make($start, $start->copy()->endOfMonth());
        } else {
            $range = DateBuckets::fromRequest($request, 'month');
        }
        $fromStart = $range->fromStart();
        $toEnd = $range->toEnd();

        // Bản cũ gọi không tham số để lấy số liệu "Trọn đời" cho danh sách: giữ nguyên cho trường hợp đó
        // (frontend mới luôn gửi from/to).
        $legacyLifetime = ! $hasRange && ! $month;

        $me = $request->user();

        // F1 đã xoá tài khoản (ẩn danh hoá, deleted_at) VẪN đếm vào tổng/doanh số — đó là lượt
        // giới thiệu thật đã phát sinh chuyến/hoa hồng; trong danh sách chỉ hiện "Người dùng đã xoá"
        // và "—" thay vì SĐT giả "deleted-<id>".
        $f1 = User::where('referred_by_user_id', $me->id)->where('role', 'customer')->orderByDesc('id')
            ->get(['id', 'name', 'phone', 'created_at', 'deleted_at']);
        $f1Ids = $f1->pluck('id');

        $inRange = fn () => Booking::whereIn('customer_id', $f1Ids)->where('status', 'completed')
            ->whereBetween('completed_at', [$fromStart, $toEnd]);

        $trips = Booking::whereIn('customer_id', $f1Ids)->where('status', 'completed')
            ->when(! $legacyLifetime, fn ($q) => $q->whereBetween('completed_at', [$fromStart, $toEnd]))
            ->selectRaw('customer_id, COUNT(*) AS trips, SUM(price - discount) AS spent, SUM(COALESCE(commission_points, 0)) AS commission')
            ->groupBy('customer_id')->get()->keyBy('customer_id');

        // Tổng hợp theo NGÀY ở SQL (groupByRaw DATE(...) — portable, an toàn ONLY_FULL_GROUP_BY),
        // rồi dồn tuần/tháng ở PHP qua DateBuckets::fold().
        $dailyTrips = $inRange()
            ->groupByRaw('DATE(completed_at)')
            ->selectRaw('DATE(completed_at) AS d, COUNT(*) AS trips, SUM(price - discount) AS revenue, SUM(COALESCE(commission_points, 0)) AS commission')
            ->get()->keyBy('d');

        $dailyNew = User::whereIn('id', $f1Ids)->whereBetween('created_at', [$fromStart, $toEnd])
            ->groupByRaw('DATE(created_at)')
            ->selectRaw('DATE(created_at) AS d, COUNT(*) AS c')
            ->get()->keyBy('d');

        $perDay = [];
        foreach ($dailyNew as $d => $row) {
            $perDay[$d]['new_f1'] = (int) $row->c;
        }
        foreach ($dailyTrips as $d => $row) {
            $perDay[$d]['f1_revenue'] = (int) $row->revenue;
            $perDay[$d]['commission_points'] = (int) $row->commission;
        }

        $monthly = collect(range(11, 0))->map(function ($ago) use ($f1) {
            $m = now()->startOfMonth()->subMonths($ago);

            return ['month' => $m->format('Y-m'), 'count' => $f1->filter(fn ($u) => $u->created_at?->format('Y-m') === $m->format('Y-m'))->count()];
        })->values();

        return response()->json([
            'from' => $range->from->format('Y-m-d'),
            'to' => $range->to->format('Y-m-d'),
            'group' => $range->group,
            'summary' => [
                'total_f1' => $f1->count(),
                'new_f1' => (int) $dailyNew->sum('c'),
                'f1_trips' => (int) $dailyTrips->sum('trips'),
                'f1_revenue' => (int) $dailyTrips->sum('revenue'),
                'commission_points' => (int) $dailyTrips->sum('commission'),
            ],
            'series' => $range->fold($perDay, ['new_f1', 'f1_revenue', 'commission_points']),
            // Khoá cũ — giữ cho bản PWA đang cache.
            'total_f1' => $f1->count(),
            'f1_this_month' => $f1->filter(fn ($u) => $u->created_at?->isSameMonth(now()))->count(),
            'monthly' => $monthly,
            'items' => $f1->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->isDeleted() ? AccountDeletionService::DELETED_NAME : $u->name,
                'phone_masked' => $u->isDeleted() ? '—' : self::mask($u->phone),
                'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($trips[$u->id]->trips ?? 0),
                'spent' => (int) ($trips[$u->id]->spent ?? 0),
                'commission_points' => (int) ($trips[$u->id]->commission ?? 0),
            ])->values(),
        ]);
    }

    /** 0912345678 → 0912***678 */
    public static function mask(?string $phone): string
    {
        $p = (string) $phone;

        return strlen($p) >= 8 ? substr($p, 0, 4).'***'.substr($p, -3) : '***';
    }
}
