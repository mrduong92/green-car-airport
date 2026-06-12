<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RevenueController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $period = $request->query('period', 'week');

        [$from, $to, $prevFrom, $prevTo, $groupFmt] = match ($period) {
            'today' => [
                today()->startOfDay(), today()->endOfDay(),
                today()->subDay()->startOfDay(), today()->subDay()->endOfDay(),
                '%H:00',
            ],
            'month' => [
                now()->startOfMonth(), now()->endOfDay(),
                now()->subMonth()->startOfMonth(), now()->subMonth()->endOfMonth(),
                '%d/%m',
            ],
            default => [ // week
                now()->subDays(6)->startOfDay(), now()->endOfDay(),
                now()->subDays(13)->startOfDay(), now()->subDays(7)->endOfDay(),
                '%d/%m',
            ],
        };

        $expr = "DATE_FORMAT(created_at, '{$groupFmt}')";

        // ── Current period ────────────────────────────────────────────────────
        $rows = Booking::where('status', 'completed')
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("{$expr} as label, SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips")
            ->groupByRaw($expr)
            ->orderByRaw($expr)
            ->get();

        $totalRevenue = (int) $rows->sum('revenue');
        $totalTrips   = (int) $rows->sum('trips');

        // ── Previous period for % change ──────────────────────────────────────
        $prev = Booking::where('status', 'completed')
            ->whereBetween('created_at', [$prevFrom, $prevTo])
            ->selectRaw('SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips')
            ->first();

        $prevRevenue = (int) ($prev->revenue ?? 0);
        $prevTrips   = (int) ($prev->trips   ?? 0);

        $revenueChange = $prevRevenue > 0
            ? round(($totalRevenue - $prevRevenue) / $prevRevenue * 100, 1)
            : ($totalRevenue > 0 ? 100.0 : 0.0);

        $tripsChange = $prevTrips > 0
            ? round(($totalTrips - $prevTrips) / $prevTrips * 100, 1)
            : ($totalTrips > 0 ? 100.0 : 0.0);

        // ── Vehicle breakdown ─────────────────────────────────────────────────
        $vehicleRows = Booking::where('status', 'completed')
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('vehicle_type, SUM(price - COALESCE(discount, 0)) as revenue, COUNT(*) as trips')
            ->groupBy('vehicle_type')
            ->orderByRaw('revenue DESC')
            ->get();

        $vehicleLabels = ['sedan_4' => 'Sedan 4 chỗ', 'suv_5' => 'SUV 5 chỗ', 'mpv_7' => 'MPV 7 chỗ'];

        // ── Top drivers ───────────────────────────────────────────────────────
        $topDrivers = Booking::where('status', 'completed')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('driver_id')
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
                'id'          => $b->id,
                'pickup'      => $b->pickup,
                'destination' => $b->destination,
                'price'       => $b->price,
                'vehicle_type'=> $b->vehicle_type,
                'driver_name' => $b->driver?->name ?? '—',
                'customer_name' => $b->customer?->name ?? '—',
                'date'        => $b->date,
                'time'        => $b->time,
            ]);

        return response()->json([
            'period'          => $period,
            'total_revenue'   => $totalRevenue,
            'app_fee'         => (int) round($totalRevenue * 0.20),
            'trips_completed' => $totalTrips,
            'avg_per_trip'    => $totalTrips > 0 ? (int) round($totalRevenue / $totalTrips) : 0,
            'revenue_change'  => $revenueChange,
            'trips_change'    => $tripsChange,
            'chart'           => $rows->map(fn ($r) => [
                'label'   => $r->label,
                'revenue' => (int) $r->revenue,
                'fee'     => (int) round($r->revenue * 0.20),
            ])->values()->all(),
            'vehicle_breakdown' => $vehicleRows->map(fn ($r) => [
                'type'    => $r->vehicle_type,
                'label'   => $vehicleLabels[$r->vehicle_type] ?? $r->vehicle_type,
                'revenue' => (int) $r->revenue,
                'trips'   => (int) $r->trips,
            ])->values()->all(),
            'top_drivers' => $topDrivers->map(fn ($r) => [
                'name'    => $r->name,
                'revenue' => (int) $r->revenue,
                'trips'   => (int) $r->trips,
            ])->values()->all(),
            'recent_trips' => $recentTrips,
        ]);
    }
}
