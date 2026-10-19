<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\User;
use App\Models\Voucher;
use App\Models\WalletTransaction;
use App\Support\CancelledTripFees;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    private const CACHE_KEY = 'admin.dashboard';

    private const CACHE_TTL = 900; // 15 minutes

    public function clearCache(): JsonResponse
    {
        Cache::forget(self::CACHE_KEY);

        return response()->json(['message' => 'Cache đã được xoá.']);
    }

    public function index(): JsonResponse
    {
        $data = Cache::remember(self::CACHE_KEY, self::CACHE_TTL, fn () => $this->build());

        return response()->json($data);
    }

    private function build(): array
    {
        // ── Today vs yesterday ────────────────────────────────────────────────
        $todayStart = today()->startOfDay();
        $todayEnd = today()->endOfDay();
        $yesterdayStart = today()->subDay()->startOfDay();
        $yesterdayEnd = today()->subDay()->endOfDay();

        // Cuốc hoàn thành tính theo NGÀY HOÀN THÀNH (completed_at).
        $completedBetween = fn ($from, $to) => Booking::where('status', 'completed')
            ->whereBetween('completed_at', [$from, $to]);

        // MỘT query cho tập cuốc hoàn thành hôm nay: số cuốc, doanh thu (giá − voucher — cùng gốc với
        // trang Doanh thu) và phí app THỰC giữ lại từng cuốc (ghi lúc nhận, không phải doanh thu ×
        // tỉ lệ hiện tại — xem Booking::keptAppFeeVndSql()).
        $feeSql = Booking::keptAppFeeVndSql(AppSetting::appFeePercent());
        $today = $completedBetween($todayStart, $todayEnd)
            ->selectRaw("COUNT(*) as trips, SUM(price - COALESCE(discount, 0)) as revenue, SUM({$feeSql}) as fee")
            ->first();

        $tripsToday = (int) $today->trips;
        $tripsYesterday = $completedBetween($yesterdayStart, $yesterdayEnd)->count();

        $tripsTodayChange = $tripsYesterday > 0
            ? (int) round(($tripsToday - $tripsYesterday) / $tripsYesterday * 100)
            : ($tripsToday > 0 ? 100 : 0);

        $revenueToday = (int) $today->revenue;

        // + phí app giữ lại từ cuốc không hoàn thành hôm nay (tài xế bỏ / khách huỷ / hệ thống gỡ).
        $appFeeToday = (int) round((float) $today->fee) + CancelledTripFees::vndBetween($todayStart, $todayEnd);

        // ── Drivers ───────────────────────────────────────────────────────────
        $driversTotal = User::where('role', 'driver')->whereNull('deleted_at')->count();
        $driversOnline = DriverProfile::where('is_online', true)->count();

        // ── Recent trips (last 10, any status) ───────────────────────────────
        $recentTrips = Booking::with(['customer', 'driver'])
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($b) => [
                'id' => $b->id,
                'customer_name' => $b->customer?->name ?? '—',
                'driver_name' => $b->driver?->name ?? 'Chưa có',
                'route' => "{$b->pickup} → {$b->destination}",
                'status' => $b->status,
                'created_at' => $b->created_at?->toISOString(),
            ])
            ->values()
            ->toArray();

        return [
            'trips_today' => $tripsToday,
            'trips_today_change' => $tripsTodayChange,
            'revenue_today' => $revenueToday,
            'drivers_online' => $driversOnline,
            'drivers_total' => $driversTotal,
            'app_fee_today' => $appFeeToday,
            'recent_trips' => $recentTrips,
            'driver_referral_points_total' => (int) WalletTransaction::where('type', 'referral')->sum('points') * 1000,
            'customer_referral_vouchers_total' => (int) Voucher::where('code', 'like', config('business.referral_voucher_prefix').'-%')->sum('value'),
        ];
    }
}
