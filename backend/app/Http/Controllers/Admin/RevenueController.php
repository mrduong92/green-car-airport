<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Support\CancelledTripFees;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class RevenueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $period = $request->query('period', 'week');

        [$from, $to, $prevFrom, $prevTo, $hourly] = match ($period) {
            'today' => [
                today()->startOfDay(), today()->endOfDay(),
                today()->subDay()->startOfDay(), today()->subDay()->endOfDay(),
                true,
            ],
            'month' => [
                now()->startOfMonth(), now()->endOfDay(),
                now()->subMonth()->startOfMonth(), now()->subMonth()->endOfMonth(),
                false,
            ],
            default => [ // week
                now()->subDays(6)->startOfDay(), now()->endOfDay(),
                now()->subDays(13)->startOfDay(), now()->subDays(7)->endOfDay(),
                false,
            ],
        };

        // Cuốc hoàn thành lọc/gom theo NGÀY HOÀN THÀNH (completed_at — mọi cuốc completed đều có,
        // xem migration 2026_10_19_000005) — cuốc đặt trước nhiều ngày tính vào ngày chạy xong.
        $inRange = fn ($q, $a, $b) => $q->whereBetween('completed_at', [$a, $b]);
        $bucket = $this->bucketSql('completed_at', $hourly);

        // ── Current period ────────────────────────────────────────────────────
        // Phí app = phí THỰC app giữ lại từng cuốc (charged_fee_points − held_shortfall_points,
        // ghi lúc nhận) — không phải doanh thu × tỉ lệ HIỆN TẠI, vốn sai khi admin đổi tỉ lệ
        // sau khi cuốc đã nhận. Xem Booking::keptAppFeeVndSql().
        $feeSql = Booking::keptAppFeeVndSql(AppSetting::appFeePercent());
        $rows = $inRange(Booking::where('status', 'completed'), $from, $to)
            ->selectRaw("{$bucket} as bucket, SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips, SUM({$feeSql}) as fee")
            ->groupByRaw($bucket)
            ->get();

        // + phí app giữ lại từ cuốc KHÔNG hoàn thành (tài xế bỏ / khách huỷ / hệ thống gỡ), theo
        // ngày huỷ: refundAcceptCharges() xoá charged/waived trên booking nên số này nằm ở log.
        $cancelledFees = CancelledTripFees::vndByBucket($from, $to, $this->bucketSql('cancelled_at', $hourly));

        $chart = [];
        foreach ($rows as $r) {
            $chart[$r->bucket] = ['revenue' => (int) $r->revenue, 'fee' => (float) $r->fee];
        }
        foreach ($cancelledFees as $bucketKey => $fee) {
            $chart[$bucketKey] ??= ['revenue' => 0, 'fee' => 0.0];
            $chart[$bucketKey]['fee'] += $fee;
        }
        ksort($chart); // khoá Y-m-d[ H] — sắp chuỗi = sắp theo thời gian

        $totalRevenue = (int) $rows->sum('revenue');
        $totalTrips = (int) $rows->sum('trips');
        $totalFee = (int) round($rows->sum('fee')) + array_sum($cancelledFees);

        // ── Previous period for % change ──────────────────────────────────────
        $prev = $inRange(Booking::where('status', 'completed'), $prevFrom, $prevTo)
            ->selectRaw('SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips')
            ->first();

        $prevRevenue = (int) ($prev->revenue ?? 0);
        $prevTrips = (int) ($prev->trips ?? 0);

        $revenueChange = $prevRevenue > 0
            ? round(($totalRevenue - $prevRevenue) / $prevRevenue * 100, 1)
            : ($totalRevenue > 0 ? 100.0 : 0.0);

        $tripsChange = $prevTrips > 0
            ? round(($totalTrips - $prevTrips) / $prevTrips * 100, 1)
            : ($totalTrips > 0 ? 100.0 : 0.0);

        // ── Vehicle breakdown ─────────────────────────────────────────────────
        $vehicleRows = $inRange(Booking::where('status', 'completed'), $from, $to)
            ->selectRaw('vehicle_type, SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips')
            ->groupBy('vehicle_type')
            ->orderByRaw('revenue DESC')
            ->get();

        $vehicleLabels = ['sedan_4' => 'Sedan 4 chỗ', 'suv_5' => 'SUV 5 chỗ', 'mpv_7' => 'MPV 7 chỗ'];

        // ── Top drivers ───────────────────────────────────────────────────────
        // Query này join `users`, mà `bookings` và `users` dùng chung tên cột
        // `created_at` / `id` / `updated_at` — PHẢI qualify tên bảng, nếu không
        // MySQL báo "Column 'created_at' in where clause is ambiguous" (500).
        $topDrivers = Booking::where('bookings.status', 'completed')
            ->whereBetween('bookings.completed_at', [$from, $to])
            ->whereNotNull('bookings.driver_id')
            ->join('users', 'bookings.driver_id', '=', 'users.id')
            ->selectRaw('users.name, SUM(bookings.price - COALESCE(bookings.discount, 0)) as revenue, COUNT(*) as trips')
            ->groupBy('users.name')
            ->orderByRaw('revenue DESC')
            ->limit(5)
            ->get();

        // ── Recent trips ──────────────────────────────────────────────────────
        $recentTrips = Booking::where('status', 'completed')
            ->with(['customer', 'driver'])
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($b) => [
                'id' => $b->id,
                'pickup' => $b->pickup,
                'destination' => $b->destination,
                'price' => $b->price,
                'vehicle_type' => $b->vehicle_type,
                'driver_name' => $b->driver?->name ?? '—',
                'customer_name' => $b->customer?->name ?? '—',
                'date' => $b->date,
                'time' => $b->time,
            ]);

        return response()->json([
            'period' => $period,
            'total_revenue' => $totalRevenue,
            'app_fee_percent' => AppSetting::appFeePercent(),
            'app_fee' => $totalFee,
            'trips_completed' => $totalTrips,
            'avg_per_trip' => $totalTrips > 0 ? (int) round($totalRevenue / $totalTrips) : 0,
            'revenue_change' => $revenueChange,
            'trips_change' => $tripsChange,
            'chart' => collect($chart)->map(fn ($c, $key) => [
                'label' => $this->bucketLabel((string) $key, $hourly),
                'revenue' => $c['revenue'],
                'fee' => (int) round($c['fee']),
            ])->values()->all(),
            'vehicle_breakdown' => $vehicleRows->map(fn ($r) => [
                'type' => $r->vehicle_type,
                'label' => $vehicleLabels[$r->vehicle_type] ?? $r->vehicle_type,
                'revenue' => (int) $r->revenue,
                'trips' => (int) $r->trips,
            ])->values()->all(),
            'top_drivers' => $topDrivers->map(fn ($r) => [
                'name' => $r->name,
                'revenue' => (int) $r->revenue,
                'trips' => (int) $r->trips,
            ])->values()->all(),
            'recent_trips' => $recentTrips,
        ]);
    }

    /**
     * Khoá gom biểu đồ, SQL portable MySQL/sqlite (không rẽ nhánh theo driver): DATE(col) → 'Y-m-d';
     * theo giờ thì SUBSTR(col, 1, 13) → 'Y-m-d H' (cả hai đều biểu diễn datetime dạng
     * 'Y-m-d H:i:s'). Gom bằng groupByRaw() trên đúng biểu thức này — an toàn ONLY_FULL_GROUP_BY.
     */
    private function bucketSql(string $column, bool $hourly): string
    {
        return $hourly ? "SUBSTR({$column}, 1, 13)" : "DATE({$column})";
    }

    /** Nhãn biểu đồ dựng ở PHP từ khoá gom: 'H:00' (hôm nay) hoặc 'd/m'. */
    private function bucketLabel(string $key, bool $hourly): string
    {
        return $hourly
            ? substr($key, 11, 2).':00'
            : Carbon::createFromFormat('Y-m-d', substr($key, 0, 10))->format('d/m');
    }
}
