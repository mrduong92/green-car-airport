<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

// Báo cáo giới thiệu (CR affiliate mục 6): top 10 người giới thiệu theo doanh số F1 trong
// khoảng ngày lọc, số F1 đăng ký + doanh số F1 + điểm thưởng đã phát theo ngày/tuần/tháng,
// chi tiết một người giới thiệu.
// Doanh số = Σ(price − discount) chuyến completed, theo ngày hoàn thành (completed_at — KHÔNG
// dùng updated_at: một UPDATE bất kỳ về sau, vd AccountDeletionService xoá note của một F1 đã xoá
// tài khoản, sẽ đẩy updated_at và kéo cuốc cũ sang nhầm bucket trong báo cáo).
class ReferralReportController extends Controller
{
    private const MAX_RANGE_DAYS = 366;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'group' => ['nullable', 'in:day,week,month'],
        ]);

        $tz = config('app.timezone');
        $group = $data['group'] ?? 'day';

        // '!' reset modifier: tránh giờ/phút/giây rác lẫn vào mốc được parse từ chuỗi Y-m-d.
        $to = isset($data['to']) ? Carbon::createFromFormat('!Y-m-d', $data['to'], $tz) : Carbon::today($tz);
        $from = isset($data['from']) ? Carbon::createFromFormat('!Y-m-d', $data['from'], $tz) : $to->copy()->subDays(29);

        if ($to->lt($from)) {
            throw ValidationException::withMessages(['to' => ['"Đến ngày" phải sau hoặc bằng "Từ ngày".']]);
        }
        // +1 vì khoảng bao gồm cả from lẫn to (vd from=to → 1 ngày).
        if ($from->diffInDays($to) + 1 > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => ['Khoảng thời gian tối đa là 366 ngày.']]);
        }

        $fromStart = $from->copy()->startOfDay();
        $toEnd = $to->copy()->endOfDay();

        // F1 = khách do một KHÁCH giới thiệu (spec) — khách do tài xế giới thiệu không tính.
        $f1Query = fn () => User::where('role', 'customer')->whereHas('referredBy', fn ($q) => $q->where('role', 'customer'));

        $f1Revenue = Booking::query()
            ->join('users as f1', 'f1.id', '=', 'bookings.customer_id')
            ->join('users as ref', 'ref.id', '=', 'f1.referred_by_user_id')
            ->where('ref.role', 'customer')
            ->where('bookings.status', 'completed')
            ->whereBetween('bookings.completed_at', [$fromStart, $toEnd])
            ->groupBy('ref.id')
            ->selectRaw('ref.id AS id, SUM(bookings.price - bookings.discount) AS revenue, SUM(COALESCE(bookings.commission_points, 0)) AS commission')
            ->orderByDesc('revenue')->limit(10)->get();

        $referrers = User::whereIn('id', $f1Revenue->pluck('id'))->withCount(['referrals as f1_total' => fn ($q) => $q->where('role', 'customer')])
            ->get(['id', 'name', 'phone'])->keyBy('id');

        $top = $f1Revenue->map(fn ($r) => [
            'id' => (int) $r->id,
            'name' => $referrers[$r->id]->name ?? null,
            'phone' => $referrers[$r->id]->phone ?? null,
            'f1_total' => (int) ($referrers[$r->id]->f1_total ?? 0),
            'f1_revenue' => (int) $r->revenue,
            'commission_points' => (int) $r->commission,
        ])->values();

        // Tổng hợp theo NGÀY trước (groupByRaw('DATE(...)') — portable MySQL + sqlite, an toàn
        // với ONLY_FULL_GROUP_BY vì SELECT chỉ gồm biểu thức DATE() + các hàm tổng hợp), sau đó
        // gộp ngày lại thành tuần/tháng ở PHP bên dưới.
        $dailyRevenue = Booking::query()
            ->join('users as f1', 'f1.id', '=', 'bookings.customer_id')
            ->join('users as ref', 'ref.id', '=', 'f1.referred_by_user_id')
            ->where('ref.role', 'customer')
            ->where('bookings.status', 'completed')
            ->whereBetween('bookings.completed_at', [$fromStart, $toEnd])
            ->groupByRaw('DATE(bookings.completed_at)')
            ->selectRaw('DATE(bookings.completed_at) AS d, SUM(bookings.price - bookings.discount) AS revenue')
            ->get()->keyBy('d');

        $dailyReward = Booking::where('status', 'completed')
            ->whereBetween('completed_at', [$fromStart, $toEnd])
            ->groupByRaw('DATE(completed_at)')
            ->selectRaw('DATE(completed_at) AS d, SUM(COALESCE(cashback_points, 0) + COALESCE(commission_points, 0)) AS reward')
            ->get()->keyBy('d');

        $dailyRegistered = $f1Query()
            ->whereBetween('created_at', [$fromStart, $toEnd])
            ->groupByRaw('DATE(created_at)')
            ->selectRaw('DATE(created_at) AS d, COUNT(*) AS c')
            ->get()->keyBy('d');

        $series = $this->buildSeries($fromStart, $toEnd, $group, $dailyRevenue, $dailyReward, $dailyRegistered);

        $summary = [
            'f1_registered' => (int) $dailyRegistered->sum('c'),
            'f1_revenue' => (int) $dailyRevenue->sum('revenue'),
            'reward_points' => (int) $dailyReward->sum('reward'),
        ];

        return response()->json([
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'group' => $group,
            'summary' => $summary,
            'top' => $top,
            'series' => $series,
        ]);
    }

    private function buildSeries(Carbon $fromStart, Carbon $toEnd, string $group, $dailyRevenue, $dailyReward, $dailyRegistered): array
    {
        // buckets ordered: key => ['days' => [Carbon...], 'f1_registered'=>, 'f1_revenue'=>, 'reward_points'=>]
        $buckets = [];

        $cursor = $fromStart->copy()->startOfDay();
        $last = $toEnd->copy()->startOfDay();

        while ($cursor->lte($last)) {
            $d = $cursor->format('Y-m-d');

            $key = match ($group) {
                'week' => $cursor->copy()->startOfWeek(Carbon::MONDAY)->format('Y-m-d'),
                'month' => $cursor->format('Y-m'),
                default => $d,
            };

            if (! isset($buckets[$key])) {
                $buckets[$key] = ['days' => [], 'f1_registered' => 0, 'f1_revenue' => 0, 'reward_points' => 0];
            }

            $buckets[$key]['days'][] = $cursor->copy();
            $buckets[$key]['f1_registered'] += (int) ($dailyRegistered[$d]->c ?? 0);
            $buckets[$key]['f1_revenue'] += (int) ($dailyRevenue[$d]->revenue ?? 0);
            $buckets[$key]['reward_points'] += (int) ($dailyReward[$d]->reward ?? 0);

            $cursor->addDay();
        }

        return collect($buckets)->map(function ($bucket, $key) use ($group) {
            $firstDay = $bucket['days'][0];
            $lastDay = $bucket['days'][count($bucket['days']) - 1];

            $label = match ($group) {
                'week' => $firstDay->format('d/m').'–'.$lastDay->format('d/m'),
                'month' => $firstDay->format('m/Y'),
                default => $firstDay->format('d/m'),
            };

            return [
                'key' => $key,
                'label' => $label,
                'f1_registered' => $bucket['f1_registered'],
                'f1_revenue' => $bucket['f1_revenue'],
                'reward_points' => $bucket['reward_points'],
            ];
        })->values()->all();
    }

    public function show(User $user): JsonResponse
    {
        $f1 = User::where('referred_by_user_id', $user->id)->where('role', 'customer')->orderByDesc('id')->get(['id', 'name', 'phone', 'created_at']);
        $trips = Booking::whereIn('customer_id', $f1->pluck('id'))->where('status', 'completed')
            ->selectRaw('customer_id, COUNT(*) AS trips, SUM(price - discount) AS spent, SUM(COALESCE(commission_points, 0)) AS commission')
            ->groupBy('customer_id')->get()->keyBy('customer_id');

        return response()->json([
            'id' => $user->id, 'name' => $user->name, 'phone' => $user->phone,
            'f1' => $f1->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'phone' => $u->phone, 'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($trips[$u->id]->trips ?? 0), 'spent' => (int) ($trips[$u->id]->spent ?? 0),
                'commission_points' => (int) ($trips[$u->id]->commission ?? 0),
            ])->values(),
        ]);
    }
}
