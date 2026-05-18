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
        $days = (int) ($request->query('days', 30));

        $rows = Booking::where('status', 'completed')
            ->where('created_at', '>=', now()->subDays($days))
            ->selectRaw('DATE(created_at) as date, SUM(price) as revenue, COUNT(*) as trips')
            ->groupByRaw('DATE(created_at)')
            ->orderByRaw('DATE(created_at)')
            ->get()
            ->map(fn ($r) => [
                'date'    => $r->date,
                'revenue' => (int) $r->revenue,
                'fee'     => (int) round($r->revenue * 0.20),
                'trips'   => (int) $r->trips,
            ]);

        $total        = $rows->sum('revenue');
        $totalFee     = $rows->sum('fee');
        $totalTrips   = $rows->sum('trips');

        return response()->json([
            'rows'        => $rows,
            'total'       => $total,
            'total_fee'   => $totalFee,
            'total_trips' => $totalTrips,
        ]);
    }
}
