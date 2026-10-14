<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// Báo cáo giới thiệu (CR affiliate mục 6): top 10 người giới thiệu theo doanh số F1 trong tháng,
// số F1 đăng ký + doanh số F1 + điểm thưởng đã phát theo 12 tháng, chi tiết một người giới thiệu.
// Doanh số = Σ(price − discount) chuyến completed, theo tháng hoàn thành (completed_at — KHÔNG
// dùng updated_at: một UPDATE bất kỳ về sau, vd AccountDeletionService xoá note của một F1 đã xoá
// tài khoản, sẽ đẩy updated_at và kéo cuốc cũ sang nhầm tháng trong báo cáo).
class ReferralReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['nullable', 'date_format:Y-m']]);
        // '!' reset modifier: tránh Carbon tràn sang tháng sau khi hôm nay là ngày 29-31
        // và tháng được chọn có ít ngày hơn (vd hôm nay 31/10, chọn month=2026-02).
        $start = isset($data['month']) ? Carbon::createFromFormat('!Y-m', $data['month'])->startOfMonth() : now()->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $f1Revenue = Booking::query()
            ->join('users as f1', 'f1.id', '=', 'bookings.customer_id')
            ->join('users as ref', 'ref.id', '=', 'f1.referred_by_user_id')
            ->where('ref.role', 'customer')
            ->where('bookings.status', 'completed')
            ->whereBetween('bookings.completed_at', [$start, $end])
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

        $monthly = collect(range(11, 0))->map(function ($ago) use ($start) {
            $m = $start->copy()->subMonths($ago);
            $mEnd = $m->copy()->endOfMonth();

            $completed = Booking::where('status', 'completed')->whereBetween('completed_at', [$m, $mEnd]);
            // F1 = khách do một KHÁCH giới thiệu (spec) — khách do tài xế giới thiệu không tính.
            $f1 = fn () => User::where('role', 'customer')->whereHas('referredBy', fn ($q) => $q->where('role', 'customer'));

            return [
                'month' => $m->format('Y-m'),
                'f1_registered' => $f1()->whereBetween('created_at', [$m, $mEnd])->count(),
                'f1_revenue' => (int) (clone $completed)->whereIn('customer_id', $f1()->select('id'))->sum(DB::raw('price - discount')),
                'reward_points' => (int) (clone $completed)->sum(DB::raw('COALESCE(cashback_points, 0) + COALESCE(commission_points, 0)')),
            ];
        })->values();

        return response()->json(['month' => $start->format('Y-m'), 'top' => $top, 'monthly' => $monthly]);
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
