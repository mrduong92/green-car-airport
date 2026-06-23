<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\Booking;
use App\Models\Voucher;
use App\Notifications\BookingCreatedNotification;
use App\Notifications\CustomerCancelledNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingController extends Controller
{
    private const VOUCHER_MAX_RATE = 0.10;

    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::with(['driver.driverProfile', 'voucher'])
            ->where('customer_id', $request->user()->id)
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
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
            'note'            => 'nullable|string|max:500',
        ]);

        $discount   = 0;
        $voucherId  = null;
        $customer   = $request->user();
        $surcharge  = $customer->pending_penalty;
        if ($surcharge > 0) {
            $customer->update(['pending_penalty' => 0]);
        }

        if (! empty($data['voucher_code'])) {
            $voucher = Voucher::where('code', $data['voucher_code'])
                ->where('is_active', true)
                ->where('expires_at', '>=', today())
                ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
                ->first();

            if ($voucher) {
                $raw       = $voucher->type === 'fixed'
                    ? $voucher->value
                    : (int) round($data['price'] * $voucher->value / 100);
                $discount  = min($raw, (int) floor($data['price'] * self::VOUCHER_MAX_RATE));
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
            'surcharge'       => $surcharge,
            'voucher_id'      => $voucherId,
            'status'          => 'finding_driver',
            'vehicle_type'    => $data['vehicle_type'],
            'note'            => $data['note'] ?? null,
        ]);

        $request->user()->notify(new BookingCreatedNotification($booking));
        SendNewBookingBroadcastJob::dispatch($booking);

        return response()->json($this->formatBooking($booking->load(['driver.driverProfile', 'voucher'])), 201);
    }

    public function active(Request $request): JsonResponse
    {
        $booking = Booking::with(['driver.driverProfile', 'voucher'])
            ->where('customer_id', $request->user()->id)
            ->whereIn('status', ['finding_driver', 'accepted', 'picking_up', 'in_progress'])
            ->latest()
            ->first();

        if (!$booking) {
            // response()->json(null) returns "{}" in some Symfony versions;
            // setContent bypasses that to produce the proper JSON null literal.
            return (new JsonResponse())->setContent('null');
        }

        return response()->json($this->formatBooking($booking));
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json($this->formatBooking($booking->load(['driver.driverProfile', 'voucher'])));
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (! in_array($booking->status, ['pending', 'finding_driver'])) {
            return response()->json(['message' => 'Không thể huỷ chuyến ở trạng thái này.'], 422);
        }

        $data = $request->validate([
            'cancel_reason' => 'nullable|string|max:255',
        ]);

        // Phạt 50,000đ nếu huỷ sau 60 phút kể từ khi tài xế nhận cuốc
        if ($booking->accepted_at && now()->diffInMinutes($booking->accepted_at, false) < -60) {
            $request->user()->increment('pending_penalty', 50_000);
        }

        $booking->update([
            'status'        => 'cancelled',
            'cancelled_at'  => now(),
            'cancelled_by'  => 'customer',
            'cancel_reason' => $data['cancel_reason'] ?? null,
        ]);

        $request->user()->notify(new CustomerCancelledNotification($booking));

        // Voucher usage_count đã tăng khi đặt; huỷ chuyến KHÔNG hoàn lại — đây là thiết kế có chủ đích.
        return response()->json($this->formatBooking($booking->fresh(['driver.driverProfile', 'voucher'])));
    }

    private function formatBooking(Booking $b): array
    {
        $driver = $b->driver;
        $profile = $driver?->driverProfile;

        return [
            'id'              => $b->id,
            'pickup'          => $b->pickup,
            'pickup_lat'      => $b->pickup_lat ? (float) $b->pickup_lat : null,
            'pickup_lng'      => $b->pickup_lng ? (float) $b->pickup_lng : null,
            'destination'     => $b->destination,
            'destination_lat' => $b->destination_lat ? (float) $b->destination_lat : null,
            'destination_lng' => $b->destination_lng ? (float) $b->destination_lng : null,
            'date'            => $b->date,
            'time'            => $b->time,
            'distance_km'     => (float) $b->distance_km,
            'price'           => $b->price,
            'discount'        => $b->discount,
            'surcharge'       => $b->surcharge,
            'final_price'     => $b->price - $b->discount + $b->surcharge,
            'voucher_code'    => $b->voucher?->code,
            'note'            => $b->note,
            'status'          => $b->status,
            'vehicle_type'    => $b->vehicle_type,
            'created_at'      => $b->created_at?->toISOString(),
            'accepted_at'     => $b->accepted_at?->toISOString(),
            'driver'          => $driver ? [
                'id'            => $driver->id,
                'name'          => $driver->name,
                'phone'         => $driver->phone,
                'vehicle_make'  => $profile?->vehicle_make,
                'vehicle_model' => $profile?->vehicle_model,
                'vehicle_plate' => $profile?->vehicle_plate,
                'vehicle_color' => $profile?->vehicle_color,
                'rating'        => $profile?->rating,
            ] : null,
        ];
    }
}
