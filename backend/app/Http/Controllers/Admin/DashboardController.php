<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $totalRevenue = Booking::where('status', 'completed')->sum('price');
        $totalFee     = (int) round($totalRevenue * 0.20);

        return response()->json([
            'total_bookings'   => Booking::count(),
            'completed'        => Booking::where('status', 'completed')->count(),
            'cancelled'        => Booking::where('status', 'cancelled')->count(),
            'finding_driver'   => Booking::where('status', 'finding_driver')->count(),
            'total_revenue'    => $totalRevenue,
            'total_fee'        => $totalFee,
            'total_drivers'    => User::where('role', 'driver')->count(),
            'total_customers'  => User::where('role', 'customer')->count(),
        ]);
    }
}
