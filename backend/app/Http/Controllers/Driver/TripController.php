<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\WalletTransaction;
use App\Notifications\BookingAcceptedNotification;
use App\Notifications\BookingCompletedCustomerNotification;
use App\Notifications\DriverCancelledNotification;
use App\Notifications\TripAcceptedDriverNotification;
use App\Notifications\TripCompletedDriverNotification;
use App\Notifications\TripStartedNotification;
use App\Services\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class TripController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $profile = $request->user()->driverProfile;

        $trips = Booking::with('customer')
            ->where('status', 'finding_driver')
            ->latest()
            ->get();

        if ($request->sort === 'nearest' && $profile?->latitude && $profile?->longitude) {
            $trips = $trips->sortBy(fn ($b) => $this->haversine(
                (float) $profile->latitude,
                (float) $profile->longitude,
                (float) $b->pickup_lat,
                (float) $b->pickup_lng,
            ))->values();
        }

        return response()->json($trips->map(fn ($b) => $this->formatTrip($b, $profile)));
    }

    public function accept(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->status !== 'finding_driver') {
            return response()->json(['message' => 'Chuyến này đã được nhận hoặc không còn khả dụng.'], 422);
        }

        $activeCount = Booking::where('driver_id', $request->user()->id)
            ->whereIn('status', ['accepted', 'picking_up', 'in_progress'])
            ->count();

        if ($activeCount >= 3) {
            return response()->json(['message' => 'Bạn đã đạt tối đa 3 cuốc đang thực hiện.'], 422);
        }

        $booking->update([
            'driver_id'   => $request->user()->id,
            'status'      => 'accepted',
            'accepted_at' => now(),
        ]);

        // Trừ 20% phí app ngay khi nhận cuốc — không hoàn nếu tài xế huỷ
        // Tính trên tổng thu (giá sau voucher + phí thu hộ)
        $totalCollected = $booking->price - $booking->discount + $booking->collection_fee;
        $feePoints      = (int) round($totalCollected * 0.20 / 1000);
        $wallet    = $request->user()->wallet()->firstOrCreate(['user_id' => $request->user()->id], ['points' => 0]);
        $wallet->decrement('points', $feePoints);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => $booking->id,
            'type'        => 'debit',
            'description' => "Phí app 20% cuốc #{$booking->id}",
            'points'      => $feePoints,
        ]);

        Redis::publish('driver.trips.events', json_encode([
            'type'       => 'trip_taken',
            'booking_id' => $booking->id,
        ]));

        // K2 — notify customer that a driver accepted
        $booking->customer?->notify(new BookingAcceptedNotification($booking, $request->user()));
        // T2 — confirm acceptance to the driver
        $request->user()->notify(new TripAcceptedDriverNotification($booking));

        return response()->json($this->formatTrip($booking->fresh('customer')));
    }

    public function updateStatus(Request $request, Booking $booking): JsonResponse
    {
        $request->validate(['status' => 'required|string']);

        if ($booking->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // accepted → in_progress → completed
        $transitions = [
            'accepted'    => 'in_progress',
            'in_progress' => 'completed',
        ];

        $newStatus = $transitions[$booking->status] ?? null;

        if (! $newStatus || $newStatus !== $request->status) {
            return response()->json(['message' => 'Chuyển trạng thái không hợp lệ.'], 422);
        }

        $booking->update(['status' => $newStatus]);

        if ($newStatus === 'in_progress') {
            // K3 — notify customer trip has started
            $booking->customer?->notify(new TripStartedNotification($booking));
        }

        if ($newStatus === 'completed') {
            $request->user()->driverProfile?->increment('trips_count');

            // Credit collaborator wallet (80% of collection fee)
            if ($booking->collection_fee > 0 && $booking->collaborator_id) {
                $collabPoints = (int) floor($booking->collection_fee * 0.80 / 1000);
                $collabWallet = \App\Models\Wallet::firstOrCreate(
                    ['user_id' => $booking->collaborator_id],
                    ['points'  => 0]
                );
                $collabWallet->increment('points', $collabPoints);
                \App\Models\WalletTransaction::create([
                    'wallet_id'   => $collabWallet->id,
                    'booking_id'  => $booking->id,
                    'type'        => 'credit',
                    'description' => "Thu hộ cuốc #{$booking->id}",
                    'points'      => $collabPoints,
                ]);
            }

            app(ReferralService::class)->processDriverReferral(
                $request->user()->fresh(['driverProfile', 'referredBy'])
            );

            // K4 — notify customer trip completed
            $booking->customer?->notify(new BookingCompletedCustomerNotification($booking));
            // T4 — notify driver of earnings
            $request->user()->notify(new TripCompletedDriverNotification($booking));

            if ($booking->customer) {
                app(ReferralService::class)->processCustomerReferral(
                    $booking->customer->fresh(['bookingsAsCustomer', 'referredBy'])
                );
            }
        }

        return response()->json($this->formatTrip($booking->fresh('customer')));
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (! in_array($booking->status, ['accepted', 'picking_up'])) {
            return response()->json(['message' => 'Không thể huỷ ở trạng thái này.'], 422);
        }

        // Phí app 20% đã trừ khi nhận — không hoàn, booking trở lại hàng đợi
        $booking->update([
            'driver_id'   => null,
            'status'      => 'finding_driver',
            'accepted_at' => null,
        ]);

        // K5 — notify customer that driver cancelled, searching for new driver
        $booking->customer?->notify(new DriverCancelledNotification($booking));

        return response()->json($this->formatTrip($booking->fresh('customer')));
    }

    public function mine(Request $request): JsonResponse
    {
        $trips = Booking::with('customer')
            ->where('driver_id', $request->user()->id)
            ->whereIn('status', ['accepted', 'picking_up', 'in_progress'])
            ->latest()
            ->get()
            ->map(fn ($b) => $this->formatTrip($b));

        return response()->json($trips);
    }

    public function history(Request $request): JsonResponse
    {
        $trips = Booking::with('customer')
            ->where('driver_id', $request->user()->id)
            ->where('status', 'completed')
            ->latest()
            ->get()
            ->map(fn ($b) => $this->formatTrip($b));

        return response()->json($trips);
    }

    private function formatTrip(Booking $b, $driverProfile = null): array
    {
        $totalCollected = $b->price - $b->discount + ($b->collection_fee ?? 0);
        $appFee         = (int) round($totalCollected * 0.20);
        $netEarning     = $totalCollected - $appFee - ($b->collection_fee ?? 0);
        $phone       = $b->customer?->phone ?? '';
        $durationMin = (int) round((float) $b->distance_km / 30 * 60);

        $statusMap = [
            'finding_driver' => 'available',
            'accepted'       => 'accepted',
            'picking_up'     => 'picking_up',
            'in_progress'    => 'in_progress',
            'completed'      => 'completed',
        ];

        $distanceToDriver = null;
        if ($driverProfile?->latitude && $b->pickup_lat) {
            $distanceToDriver = round($this->haversine(
                (float) $driverProfile->latitude,
                (float) $driverProfile->longitude,
                (float) $b->pickup_lat,
                (float) $b->pickup_lng,
            ), 1);
        }

        return [
            'id'                    => $b->id,
            'booking_id'            => $b->id,
            'pickup'                => $b->pickup,
            'pickup_lat'            => $b->pickup_lat ? (float) $b->pickup_lat : null,
            'pickup_lng'            => $b->pickup_lng ? (float) $b->pickup_lng : null,
            'destination'           => $b->destination,
            'destination_lat'       => $b->destination_lat ? (float) $b->destination_lat : null,
            'destination_lng'       => $b->destination_lng ? (float) $b->destination_lng : null,
            'date'                  => $b->date,
            'time'                  => $b->time,
            'distance_km'           => (float) $b->distance_km,
            'duration_min'          => $durationMin,
            'price'                 => $b->price,
            'discount'              => $b->discount,
            'final_price'           => $totalCollected,
            'app_fee'               => $appFee,
            'net_earning'           => $netEarning,
            'status'                => $statusMap[$b->status] ?? $b->status,
            'is_new'                => $b->created_at?->gt(now()->subMinutes(30)) ?? false,
            'customer_name'         => $b->customer?->name,
            'customer_phone'        => $phone,
            'customer_phone_masked' => $phone ? substr($phone, 0, -3) . '***' : '',
            'customer_note'         => $b->note,
            'created_at'            => $b->created_at?->toISOString(),
            'distance_to_driver'    => $distanceToDriver,
        ];
    }

    private function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        if (! $lat2 || ! $lng2) {
            return PHP_FLOAT_MAX;
        }

        $R  = 6371;
        $dL = deg2rad($lat2 - $lat1);
        $dl = deg2rad($lng2 - $lng1);
        $a  = sin($dL / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dl / 2) ** 2;

        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
