<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\WalletTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TripController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $trips = Booking::with('customer')
            ->where('status', 'finding_driver')
            ->latest()
            ->get()
            ->map(fn ($b) => $this->formatTrip($b));

        return response()->json($trips);
    }

    public function accept(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->status !== 'finding_driver') {
            return response()->json(['message' => 'Chuyến này đã được nhận hoặc không còn khả dụng.'], 422);
        }

        $booking->update([
            'driver_id' => $request->user()->id,
            'status'    => 'accepted',
        ]);

        return response()->json($this->formatTrip($booking->fresh('customer')));
    }

    public function updateStatus(Request $request, Booking $booking): JsonResponse
    {
        $request->validate(['status' => 'required|string']);

        if ($booking->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $map = [
            'in_progress' => 'in_progress',
            'completed'   => 'completed',
        ];

        $newStatus = $map[$request->status] ?? null;

        if (! $newStatus) {
            return response()->json(['message' => 'Trạng thái không hợp lệ.'], 422);
        }

        $booking->update(['status' => $newStatus]);

        if ($newStatus === 'completed') {
            $this->creditEarning($request->user(), $booking);
        }

        return response()->json($this->formatTrip($booking->fresh('customer')));
    }

    private function creditEarning($driver, Booking $booking): void
    {
        $appFee    = (int) round($booking->price * 0.20);
        $netPoints = (int) round(($booking->price - $appFee) / 1000);

        $wallet = $driver->wallet()->firstOrCreate(['user_id' => $driver->id], ['points' => 0]);
        $wallet->increment('points', $netPoints);

        WalletTransaction::create([
            'wallet_id'  => $wallet->id,
            'booking_id' => $booking->id,
            'type'       => 'credit',
            'description'=> "Hoàn thành chuyến #{$booking->id}",
            'points'     => $netPoints,
        ]);

        $driver->driverProfile?->increment('trips_count');
    }

    private function formatTrip(Booking $b): array
    {
        $appFee     = (int) round($b->price * 0.20);
        $netEarning = $b->price - $appFee;
        $phone      = $b->customer?->phone ?? '';

        return [
            'id'            => $b->id,
            'pickup'        => $b->pickup,
            'destination'   => $b->destination,
            'date'          => $b->date,
            'time'          => $b->time,
            'distance_km'   => (float) $b->distance_km,
            'price'         => $b->price,
            'app_fee'       => $appFee,
            'net_earning'   => $netEarning,
            'status'        => $b->status,
            'customer_name' => $b->customer?->name,
            'customer_phone'=> substr($phone, 0, -3) . '***',
            'created_at'    => $b->created_at?->toISOString(),
        ];
    }
}
