<?php

namespace App\Http\Controllers\Driver;

use App\Events\CustomerBookingUpdated;
use App\Events\DriverTripsUpdated;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\BookingAcceptedNotification;
use App\Notifications\BookingCompletedCustomerNotification;
use App\Notifications\DriverCancelledNotification;
use App\Notifications\TripAcceptedDriverNotification;
use App\Notifications\TripCompletedDriverNotification;
use App\Notifications\TripStartedNotification;
use App\Services\ReferralService;
use App\Support\AvailableTripsCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TripController extends Controller
{
    /**
     * Số cuốc tài xế được giữ cùng lúc (accepted / picking_up / in_progress).
     * Đổi ở đây thì phải đổi luôn MAX_ACTIVE_TRIPS trong frontend/src/rules.ts —
     * app tài xế dùng con số đó để chặn nút "Nhận cuốc" và ghi text quy định.
     */
    public const MAX_ACTIVE_TRIPS = 5;

    /**
     * Trần số cuốc trả về cho danh sách chờ. Tài xế không cuộn hết 50 cuốc, mà
     * không có trần thì sàn đông là nạp nguyên bảng cho mỗi lần gọi.
     */
    private const AVAILABLE_TRIPS_LIMIT = 50;

    public function index(Request $request): JsonResponse
    {
        $profile = $request->user()->driverProfile;

        // Lọc loại xe đẩy xuống SQL thay vì ->filter() sau khi đã nạp cả bảng,
        // kèm trần AVAILABLE_TRIPS_LIMIT. Trước đây `->get()` không giới hạn:
        // 500 cuốc trên sàn × mỗi tài xế mở app = nạp và serialize 500 dòng mỗi lần.
        //
        // Cache theo LOẠI XE chứ không theo tài xế — cùng loại xe thì cùng danh
        // sách, nên 5.000 tài xế chỉ còn vài query mỗi 5 giây.
        $allowed = $this->vehicleTypesFittingDriver($profile?->vehicle_type);

        // ⚠️ Cache MẢNG ĐÃ FORMAT, tuyệt đối không cache Eloquent Collection:
        // collection/model serialize xuống Redis rồi unserialize lên sẽ thành
        // __PHP_Incomplete_Class và nổ ngay ở lần ĐỌC cache đầu tiên (lần ghi
        // vẫn chạy ngon, nên lỗi chỉ hiện ở request thứ hai trở đi).
        $trips = AvailableTripsCache::remember($allowed, fn () => Booking::with('customer')
            ->where('status', 'finding_driver')
            // `bookings.vehicle_type` là enum('sedan_4','suv_5','mpv_7') NOT NULL
            // default 'sedan_4', nên whereIn là đủ — không cần nhánh phòng thủ cho
            // null/giá trị lạ vì DB không cho phép tồn tại (xem test parity bên dưới).
            ->whereIn('vehicle_type', $allowed)
            ->latest()
            ->limit(self::AVAILABLE_TRIPS_LIMIT)
            ->get()
            // KHÔNG truyền profile vào đây — phần phụ thuộc từng tài xế tính sau
            ->map(fn (Booking $b) => $this->formatTrip($b))
            ->all());

        // distance_to_driver phụ thuộc vị trí từng tài xế nên không nằm trong
        // cache chung được. Tính trên tối đa AVAILABLE_TRIPS_LIMIT dòng.
        if ($profile?->latitude && $profile?->longitude) {
            $trips = array_map(function (array $trip) use ($profile) {
                $trip['distance_to_driver'] = $trip['pickup_lat']
                    ? round($this->haversine(
                        (float) $profile->latitude,
                        (float) $profile->longitude,
                        (float) $trip['pickup_lat'],
                        (float) $trip['pickup_lng'],
                    ), 1)
                    : null;

                return $trip;
            }, $trips);

            if ($request->sort === 'nearest') {
                // Cuốc thiếu toạ độ xuống cuối, khớp hành vi cũ (haversine trả
                // PHP_FLOAT_MAX khi không có toạ độ điểm đón).
                usort($trips, fn (array $a, array $b) => ($a['distance_to_driver'] ?? PHP_FLOAT_MAX)
                    <=> ($b['distance_to_driver'] ?? PHP_FLOAT_MAX));
            }
        }

        return response()->json(array_values($trips));
    }

    public function accept(Request $request, Booking $booking): JsonResponse
    {
        $driverStatus = $request->user()->driverProfile?->status;
        if ($driverStatus !== 'active') {
            $message = $driverStatus === 'blocked'
                ? 'Tài khoản đã bị khoá bởi admin.'
                : 'Tài khoản chưa được phê duyệt.';

            return response()->json(['message' => $message], 403);
        }

        if ($booking->status !== 'finding_driver') {
            return response()->json(['message' => 'Chuyến này đã được nhận hoặc không còn khả dụng.'], 422);
        }

        if (! $this->fitsDriverVehicle($booking->vehicle_type, $request->user()->driverProfile?->vehicle_type)) {
            return response()->json(['message' => 'Cuốc này cần xe lớn hơn, không phù hợp với xe của bạn.'], 422);
        }

        $activeCount = Booking::where('driver_id', $request->user()->id)
            ->whereIn('status', ['accepted', 'picking_up', 'in_progress'])
            ->count();

        if ($activeCount >= self::MAX_ACTIVE_TRIPS) {
            return response()->json([
                'message' => 'Bạn đã đạt tối đa '.self::MAX_ACTIVE_TRIPS.' cuốc đang thực hiện.',
            ], 422);
        }

        // Trừ 20% phí app ngay khi nhận cuốc (chỉ tính trên giá cuốc, không gộp thu hộ).
        // Check số dư TRƯỚC khi cập nhật booking — cột points là UNSIGNED, trừ âm sẽ
        // crash SQL và để lại booking đã accepted nhưng chưa trừ phí.
        $totalCollected = $booking->price - $booking->discount;
        $feePoints = (int) round($totalCollected * 0.20 / 1000);
        $wallet = $request->user()->wallet()->firstOrCreate(['user_id' => $request->user()->id], ['points' => 0]);

        if ($wallet->points < $feePoints) {
            return response()->json([
                'message' => "Số dư ví không đủ để nhận cuốc (cần {$feePoints} điểm phí app, ví còn {$wallet->points} điểm). Vui lòng nạp thêm điểm.",
            ], 422);
        }

        $booking->update([
            'driver_id' => $request->user()->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        $wallet->decrement('points', $feePoints);
        WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'booking_id' => $booking->id,
            'type' => 'debit',
            'description' => "Phí app 20% cuốc #{$booking->id}",
            'points' => $feePoints,
        ]);

        // Cuốc rời khỏi sàn — vô hiệu hoá cache danh sách, nếu không tài xế khác
        // vẫn thấy cuốc này trong danh sách và bấm nhận rồi mới ăn lỗi 422.
        AvailableTripsCache::flush();

        DriverTripsUpdated::dispatch('trip_taken', $booking->id);

        CustomerBookingUpdated::dispatch($booking->customer_id, 'booking_accepted', $booking->id);

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
            'accepted' => 'in_progress',
            'in_progress' => 'completed',
        ];

        $newStatus = $transitions[$booking->status] ?? null;

        if (! $newStatus || $newStatus !== $request->status) {
            return response()->json(['message' => 'Chuyển trạng thái không hợp lệ.'], 422);
        }

        $booking->update(['status' => $newStatus]);

        if ($newStatus === 'in_progress') {
            CustomerBookingUpdated::dispatch($booking->customer_id, 'trip_started', $booking->id);
            // K3 — notify customer trip has started
            $booking->customer?->notify(new TripStartedNotification($booking));
        }

        if ($newStatus === 'completed') {
            DB::transaction(function () use ($booking, $request) {
                $request->user()->driverProfile?->increment('trips_count');

                // Cash-flow: driver collects (price + surcharge) in cash from customer.
                // Company reclaims the surcharge by debiting the driver's wallet at completion.
                // Net: driver keeps (price - discount) * 80%; company gets fee + surcharge.
                // Deduct surcharge from driver wallet — surcharge goes to company
                if ($booking->surcharge > 0) {
                    $surchargePoints = (int) round($booking->surcharge / 1000);
                    $driverWallet = $request->user()->wallet()->first();
                    if ($driverWallet && $surchargePoints > 0) {
                        $driverWallet->decrement('points', $surchargePoints);
                        WalletTransaction::create([
                            'wallet_id' => $driverWallet->id,
                            'booking_id' => $booking->id,
                            'type' => 'debit',
                            'description' => "Phí phạt huỷ khách cuốc #{$booking->id}",
                            'points' => $surchargePoints,
                        ]);
                    }
                }

                // Debit driver full thu hộ, credit 80% to collaborator (company retains 20% gap)
                if ($booking->collection_fee > 0 && $booking->collaborator_id) {
                    $collectionPoints = (int) round($booking->collection_fee / 1000);
                    $collabPoints = (int) floor($booking->collection_fee * 0.80 / 1000);

                    // Debit driver: full thu hộ collected in cash from customer
                    $driverWallet = $request->user()->wallet()->first();
                    if ($driverWallet && $collectionPoints > 0) {
                        $driverWallet->decrement('points', $collectionPoints);
                        WalletTransaction::create([
                            'wallet_id' => $driverWallet->id,
                            'booking_id' => $booking->id,
                            'type' => 'debit',
                            'description' => "Thu hộ cuốc #{$booking->id}",
                            'points' => $collectionPoints,
                        ]);
                    }

                    // Credit collaborator 80%
                    $collabWallet = Wallet::firstOrCreate(
                        ['user_id' => $booking->collaborator_id],
                        ['points' => 0]
                    );
                    $collabWallet->increment('points', $collabPoints);
                    WalletTransaction::create([
                        'wallet_id' => $collabWallet->id,
                        'booking_id' => $booking->id,
                        'type' => 'credit',
                        'description' => "Thu hộ cuốc #{$booking->id}",
                        'points' => $collabPoints,
                    ]);
                }
            });

            app(ReferralService::class)->processDriverReferral(
                $request->user()->fresh(['driverProfile', 'referredBy'])
            );

            CustomerBookingUpdated::dispatch($booking->customer_id, 'trip_completed', $booking->id);

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
            'driver_id' => null,
            'status' => 'finding_driver',
            'accepted_at' => null,
        ]);

        // Cuốc QUAY LẠI sàn — không flush thì tài xế khác không thấy nó xuất hiện lại.
        AvailableTripsCache::flush();

        CustomerBookingUpdated::dispatch($booking->customer_id, 'booking_cancelled_by_driver', $booking->id);

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

    /**
     * Chi tiết MỘT cuốc của tài xế, không phụ thuộc trạng thái.
     *
     * Trước đây màn hình chi tiết đi quét danh sách `mine` (chỉ có cuốc đang
     * chạy), nên bấm vào cuốc trong tab Lịch sử — vốn là cuốc `completed` — luôn
     * ra "Không tìm thấy cuốc xe này". Cuốc bị khách huỷ cũng dính lỗi tương tự
     * vì không nằm trong danh sách nào.
     *
     * ⚠️ Route này phải đăng ký SAU `/driver/trips/mine` và `/history`, nếu không
     * Laravel sẽ khớp "mine" thành {booking} và cả hai màn hình cùng vỡ.
     */
    public function show(Request $request, Booking $booking): JsonResponse
    {
        if ($booking->driver_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json($this->formatTrip(
            $booking->load('customer'),
            $request->user()->driverProfile,
        ));
    }

    private const VEHICLE_CAPACITY_RANK = [
        'sedan_4' => 4,
        'suv_5' => 5,
        'mpv_7' => 7,
    ];

    /**
     * Bản SQL-hoá của fitsDriverVehicle(): trả về các loại xe mà tài xế chở được.
     * Xe không rõ loại → cho phép tất cả, khớp với nhánh `! $driverType` bên dưới.
     *
     * @return list<string>
     */
    private function vehicleTypesFittingDriver(?string $driverType): array
    {
        if (! $driverType || ! isset(self::VEHICLE_CAPACITY_RANK[$driverType])) {
            return array_keys(self::VEHICLE_CAPACITY_RANK);
        }

        $driverRank = self::VEHICLE_CAPACITY_RANK[$driverType];

        return array_keys(array_filter(
            self::VEHICLE_CAPACITY_RANK,
            fn (int $rank) => $rank <= $driverRank,
        ));
    }

    private function fitsDriverVehicle(?string $bookingType, ?string $driverType): bool
    {
        if (! $driverType || ! isset(self::VEHICLE_CAPACITY_RANK[$driverType])) {
            return true;
        }

        $bookingRank = self::VEHICLE_CAPACITY_RANK[$bookingType] ?? 0;
        $driverRank = self::VEHICLE_CAPACITY_RANK[$driverType];

        return $bookingRank <= $driverRank;
    }

    private function formatTrip(Booking $b, $driverProfile = null): array
    {
        $totalCollected = $b->price - $b->discount + ($b->collection_fee ?? 0);
        $appFee = (int) round($totalCollected * 0.20);
        $netEarning = $totalCollected - $appFee - ($b->collection_fee ?? 0);
        $phone = $b->customer?->phone ?? '';
        $durationMin = (int) round((float) $b->distance_km / 30 * 60);

        $statusMap = [
            'finding_driver' => 'available',
            'accepted' => 'accepted',
            'picking_up' => 'picking_up',
            'in_progress' => 'in_progress',
            'completed' => 'completed',
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
            'id' => $b->id,
            'booking_id' => $b->id,
            'pickup' => $b->pickup,
            'pickup_lat' => $b->pickup_lat ? (float) $b->pickup_lat : null,
            'pickup_lng' => $b->pickup_lng ? (float) $b->pickup_lng : null,
            'destination' => $b->destination,
            'destination_lat' => $b->destination_lat ? (float) $b->destination_lat : null,
            'destination_lng' => $b->destination_lng ? (float) $b->destination_lng : null,
            'date' => $b->date,
            'time' => $b->time,
            'distance_km' => (float) $b->distance_km,
            'duration_min' => $durationMin,
            'price' => $b->price,
            'discount' => $b->discount,
            'surcharge' => $b->surcharge,
            'collection_fee' => (int) ($b->collection_fee ?? 0),
            'final_price' => $b->price - $b->discount + $b->surcharge + ($b->collection_fee ?? 0),
            'app_fee' => $appFee,
            'net_earning' => $netEarning,
            'status' => $statusMap[$b->status] ?? $b->status,
            'is_new' => $b->created_at?->gt(now()->subMinutes(30)) ?? false,
            'customer_name' => $b->customer?->name,
            'customer_phone' => $phone,
            'customer_phone_masked' => $phone ? substr($phone, 0, -3).'***' : '',
            'customer_note' => $b->note,
            'created_at' => $b->created_at?->toISOString(),
            'distance_to_driver' => $distanceToDriver,
        ];
    }

    private function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        if (! $lat2 || ! $lng2) {
            return PHP_FLOAT_MAX;
        }

        $R = 6371;
        $dL = deg2rad($lat2 - $lat1);
        $dl = deg2rad($lng2 - $lng1);
        $a = sin($dL / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dl / 2) ** 2;

        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
