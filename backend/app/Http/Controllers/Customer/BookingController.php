<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Voucher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::with(['driver.driverProfile'])
            ->where('customer_id', $request->user()->id)
            ->latest()
            ->get()
            ->map(fn ($b) => $this->formatBooking($b));

        return response()->json($bookings);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pickup'          => 'required|string',
            'pickup_lat'      => 'nullable|numeric|between:-90,90',
            'pickup_lng'      => 'nullable|numeric|between:-180,180',
            'destination'     => 'required|string',
            'destination_lat' => 'nullable|numeric|between:-90,90',
            'destination_lng' => 'nullable|numeric|between:-180,180',
            'date'            => 'required|date_format:Y-m-d',
            'time'            => 'required|date_format:H:i',
            'vehicle_type'    => 'required|in:sedan_4,suv_5,mpv_7',
            'distance_km'     => 'required|numeric|min:0',
            'price'           => 'required|integer|min:0',
            'voucher_code'    => 'nullable|string',
        ]);

        $discount   = 0;
        $voucherId  = null;

        if (! empty($data['voucher_code'])) {
            $voucher = Voucher::where('code', $data['voucher_code'])
                ->where('is_active', true)
                ->where('expires_at', '>=', today())
                ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
                ->first();

            if ($voucher) {
                $discount  = $voucher->type === 'fixed'
                    ? $voucher->value
                    : (int) round($data['price'] * $voucher->value / 100);
                $voucherId = $voucher->id;
                $voucher->increment('usage_count');
            }
        }

        $booking = Booking::create([
            'customer_id'     => $request->user()->id,
            'pickup'          => $data['pickup'],
            'pickup_lat'      => $data['pickup_lat'] ?? null,
            'pickup_lng'      => $data['pickup_lng'] ?? null,
            'destination'     => $data['destination'],
            'destination_lat' => $data['destination_lat'] ?? null,
            'destination_lng' => $data['destination_lng'] ?? null,
            'date'            => $data['date'],
            'time'            => $data['time'],
            'distance_km'     => $data['distance_km'],
            'price'           => $data['price'],
            'discount'        => $discount,
            'voucher_id'      => $voucherId,
            'status'          => 'finding_driver',
            'vehicle_type'    => $data['vehicle_type'],
        ]);

        return response()->json($this->formatBooking($booking->load('driver.driverProfile')), 201);
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json($this->formatBooking($booking->load('driver.driverProfile')));
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (! in_array($booking->status, ['pending', 'finding_driver'])) {
            return response()->json(['message' => 'Không thể huỷ chuyến ở trạng thái này.'], 422);
        }

        $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);

        return response()->json($this->formatBooking($booking->fresh('driver.driverProfile')));
    }

    private function formatBooking(Booking $b): array
    {
        $driver = $b->driver;
        $profile = $driver?->driverProfile;

        return [
            'id'          => $b->id,
            'pickup'      => $b->pickup,
            'destination' => $b->destination,
            'date'        => $b->date,
            'time'        => $b->time,
            'distance_km' => (float) $b->distance_km,
            'price'       => $b->price,
            'discount'    => $b->discount,
            'final_price' => $b->price - $b->discount,
            'status'      => $b->status,
            'vehicle_type' => $b->vehicle_type,
            'created_at'  => $b->created_at?->toISOString(),
            'driver'      => $driver ? [
                'id'            => $driver->id,
                'name'          => $driver->name,
                'vehicle_make'  => $profile?->vehicle_make,
                'vehicle_model' => $profile?->vehicle_model,
                'vehicle_plate' => $profile?->vehicle_plate,
                'vehicle_color' => $profile?->vehicle_color,
                'rating'        => $profile?->rating,
            ] : null,
        ];
    }
}
