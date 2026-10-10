<?php

namespace App\Http\Controllers\Driver;

use App\Events\CustomerBookingUpdated;
use App\Events\DriverTripsUpdated;
use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\BookingDriverCancellation;
use App\Models\Wallet;
use App\Notifications\BookingAcceptedNotification;
use App\Notifications\BookingCompletedCustomerNotification;
use App\Notifications\DriverCancelledNotification;
use App\Notifications\TripAcceptedDriverNotification;
use App\Notifications\TripCompletedDriverNotification;
use App\Notifications\TripStartedNotification;
use App\Services\ReferralService;
use App\Support\AvailableTripsCache;
use App\Support\VehicleCapacity;
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
        $allowed = VehicleCapacity::bookingTypesFittingDriver($profile?->vehicle_type);
        $driverIsVip = (bool) $profile?->is_vip;

        // ⚠️ Cache MẢNG ĐÃ FORMAT, tuyệt đối không cache Eloquent Collection:
        // collection/model serialize xuống Redis rồi unserialize lên sẽ thành
        // __PHP_Incomplete_Class và nổ ngay ở lần ĐỌC cache đầu tiên (lần ghi
        // vẫn chạy ngon, nên lỗi chỉ hiện ở request thứ hai trở đi).
        $trips = AvailableTripsCache::remember($allowed, $driverIsVip, fn () => Booking::with('customer')
            ->where('status', 'finding_driver')
            // `bookings.vehicle_type` là enum('sedan_4','suv_5','mpv_7') NOT NULL
            // default 'sedan_4', nên whereIn là đủ — không cần nhánh phòng thủ cho
            // null/giá trị lạ vì DB không cho phép tồn tại (xem test parity bên dưới).
            ->whereIn('vehicle_type', $allowed)
            // Tài xế thường không thấy cuốc VIP. Tài xế VIP thấy cả hai — xe
            // biển trắng chạy cuốc thường được, không có lý do chặn.
            ->when(! $driverIsVip, fn ($q) => $q->where('is_vip', false))
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

        $profile = $request->user()->driverProfile;

        if (! VehicleCapacity::fits(
            $booking->vehicle_type,
            $profile?->vehicle_type,
            (bool) $booking->is_vip,
            (bool) $profile?->is_vip,
        )) {
            // Chọn thông báo theo lý do THẬT: báo nhầm "cần xe lớn hơn" cho một
            // tài xế bị chặn vì không phải xe cá nhân sẽ khiến họ đi đổi xe.
            return response()->json([
                'message' => $booking->is_vip && ! $profile?->is_vip
                    ? 'Cuốc VIP chỉ dành cho tài xế xe cá nhân (biển trắng).'
                    : 'Cuốc này cần xe lớn hơn, không phù hợp với xe của bạn.',
            ], 422);
        }

        $activeCount = Booking::where('driver_id', $request->user()->id)
            ->whereIn('status', ['accepted', 'picking_up', 'in_progress'])
            ->count();

        if ($activeCount >= self::MAX_ACTIVE_TRIPS) {
            return response()->json([
                'message' => 'Bạn đã đạt tối đa '.self::MAX_ACTIVE_TRIPS.' cuốc đang thực hiện.',
            ], 422);
        }

        // Trừ NGAY khi nhận cuốc, trong một transaction:
        //  - phí app (AppSetting::appFeePercent) — chỉ tính trên giá cuốc, không gộp thu hộ;
        //  - TẠM GIỮ thu hộ + phí phạt huỷ — tiền mặt tài xế sẽ thu của khách rồi nộp lại.
        // Trước đây thu hộ/phạt trừ lúc HOÀN THÀNH: ví không đủ thì lệnh trừ vượt cột
        // UNSIGNED và nổ SQL, booking đã `completed` mà CTV không được cộng (cuốc #513).
        // Khoá dòng booking + ví: chặn 2 tài xế cùng nhận, hoặc 1 tài xế bấm 2 lần.
        $driver = $request->user();
        $error = DB::transaction(function () use ($booking, $driver) {
            $booking = Booking::lockForUpdate()->find($booking->id);
            if ($booking->status !== 'finding_driver') {
                return 'Chuyến này đã được nhận hoặc không còn khả dụng.';
            }

            $feePoints = $booking->appFeePoints(AppSetting::appFeeRate());
            $collectionPoints = $booking->collectionPoints();
            $surchargePoints = $booking->surchargePoints();
            $required = $feePoints + $collectionPoints + $surchargePoints;

            $wallet = Wallet::lockedFor($driver->id);

            if ($wallet->points < $required) {
                $parts = ["{$feePoints} điểm phí app"];
                if ($collectionPoints > 0) $parts[] = "{$collectionPoints} điểm thu hộ";
                if ($surchargePoints > 0) $parts[] = "{$surchargePoints} điểm phí phạt huỷ";

                return "Số dư ví không đủ để nhận cuốc (cần {$required} điểm: ".implode(' + ', $parts)
                    .", ví còn {$wallet->points} điểm). Vui lòng nạp thêm điểm.";
            }

            // Ghi lại ĐÚNG số đã trừ: huỷ thì hoàn theo số này, hoàn thành thì cộng CTV
            // theo số này — không tính lại theo tỉ lệ phí / tiền thu hộ lúc đó.
            $booking->update([
                'driver_id' => $driver->id,
                'status' => 'accepted',
                'accepted_at' => now(),
                'charged_fee_points' => $feePoints,
                'held_collection_points' => $collectionPoints,
                'held_surcharge_points' => $surchargePoints,
            ]);

            $wallet->debit($feePoints, 'Phí app '.AppSetting::appFeePercent()."% cuốc #{$booking->id}", $booking->id);
            $wallet->debit($collectionPoints, "Thu hộ cuốc #{$booking->id}", $booking->id);
            $wallet->debit($surchargePoints, "Phí phạt huỷ khách cuốc #{$booking->id}", $booking->id);

            return null;
        });

        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        $booking->refresh();

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

        if ($newStatus === 'completed') {
            // Đổi trạng thái + toàn bộ tiền trong CÙNG một transaction: lỗi ở bất kỳ
            // bước nào thì cuốc vẫn `in_progress`, không còn cảnh "hoàn thành nhưng
            // không trừ/cộng điểm" như trước.
            $error = DB::transaction(fn () => $this->settleCompletion($booking, $request->user()));
            if ($error) {
                return response()->json(['message' => $error], 422);
            }
            $booking->refresh();
        } else {
            $booking->update(['status' => $newStatus]);
        }

        if ($newStatus === 'in_progress') {
            CustomerBookingUpdated::dispatch($booking->customer_id, 'trip_started', $booking->id);
            // K3 — notify customer trip has started
            $booking->customer?->notify(new TripStartedNotification($booking));
        }

        if ($newStatus === 'completed') {
            app(ReferralService::class)->processDriverReferral(
                $request->user()->fresh(['driverProfile', 'referredBy'])
            );

            CustomerBookingUpdated::dispatch($booking->customer_id, 'trip_completed', $booking->id);

            // K4 — notify customer trip completed
            $booking->customer?->notify(new BookingCompletedCustomerNotification($booking));
            // T4 — notify driver of earnings
            $request->user()->notify(new TripCompletedDriverNotification($booking));
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

        $data = $request->validate(['reason' => 'nullable|string|max:255']);
        $driverId = $request->user()->id;

        // Phí app đã trừ khi nhận — không hoàn, booking trở lại hàng đợi. Ghi lại
        // việc BỎ cuốc vào bảng riêng (không phải bookings.cancelled_*) vì booking sẽ
        // được tài xế khác nhận lại — cancelled_by/cancelled_at trên chính booking là
        // để ghi trạng thái CUỐI của nó, không phải lịch sử từng tài xế đã bỏ.
        // Khoá + kiểm lại trạng thái TRONG transaction: bấm "Huỷ" 2 lần, hoặc khách huỷ
        // cùng lúc, thì chỉ một request đi qua — không hoàn tiền tạm giữ 2 lần.
        // Thu hộ/phí phạt tạm giữ lúc nhận thì HOÀN (tài xế chưa thu được của khách);
        // phí app thì không — giữ nguyên quy tắc tài xế bỏ cuốc mất phí.
        $error = DB::transaction(function () use ($booking, $driverId, $data) {
            $booking = Booking::lockForUpdate()->find($booking->id);
            if ($booking->driver_id !== $driverId || ! in_array($booking->status, ['accepted', 'picking_up'])) {
                return 'Không thể huỷ ở trạng thái này.';
            }

            BookingDriverCancellation::create([
                'booking_id' => $booking->id,
                'driver_id' => $driverId,
                'reason' => $data['reason'] ?? null,
                'cancelled_at' => now(),
            ]);

            $booking->refundAcceptCharges('tài xế', refundFee: false);

            $booking->update([
                'driver_id' => null,
                'status' => 'finding_driver',
                'accepted_at' => null,
            ]);

            return null;
        });

        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        $booking->refresh();

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
        $driverId = $request->user()->id;

        // Cuốc đã hoàn thành, hoặc bị khách/hệ thống huỷ MÀ VẪN gắn với tài xế này
        // (khách huỷ giữ nguyên driver_id — xem BookingController::cancel()).
        $ownBookings = Booking::with('customer')
            ->where('driver_id', $driverId)
            ->whereIn('status', ['completed', 'cancelled'])
            ->get()
            ->map(fn (Booking $b) => [
                'at' => $b->cancelled_at ?? $b->updated_at,
                'data' => $this->formatTrip($b),
            ]);

        // Cuốc tài xế NÀY từng nhận rồi tự bỏ (quay lại hàng đợi). Booking có thể đã
        // được tài xế khác nhận/hoàn thành sau đó — dùng đúng bản ghi bỏ cuốc của
        // tài xế này, không dùng trạng thái/driver_id HIỆN TẠI của booking.
        $ownDrops = BookingDriverCancellation::with('booking.customer')
            ->where('driver_id', $driverId)
            ->get()
            ->map(fn (BookingDriverCancellation $log) => [
                'at' => $log->cancelled_at,
                'data' => $this->formatDriverDrop($log),
            ]);

        $trips = $ownBookings->concat($ownDrops)
            ->sortByDesc('at')
            ->pluck('data')
            ->values();

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
        if ($booking->driver_id === $request->user()->id) {
            return response()->json($this->formatTrip(
                $booking->load('customer'),
                $request->user()->driverProfile,
            ));
        }

        // Không còn gắn với tài xế này (bị người khác nhận lại) — nhưng nếu chính
        // tài xế này từng bỏ cuốc, vẫn phải mở được để xem lại lý do/thời gian.
        $drop = BookingDriverCancellation::where('booking_id', $booking->id)
            ->where('driver_id', $request->user()->id)
            ->latest('cancelled_at')
            ->first();

        if (! $drop) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json($this->formatDriverDrop($drop, $request->user()->driverProfile));
    }

    /**
     * Quyết toán khi hoàn thành cuốc. Chạy TRONG transaction; trả về thông báo lỗi
     * (rollback, cuốc giữ nguyên `in_progress`) hoặc null nếu thành công.
     *
     * Cuốc nhận từ bản này đã tạm giữ thu hộ + phí phạt trong ví lúc nhận
     * (`charged_fee_points` có giá trị), nên ở đây chỉ còn cộng điểm cho CTV. Cuốc
     * nhận TRƯỚC bản này (`charged_fee_points` NULL) vẫn trừ tài xế tại đây như cũ — ví không đủ thì
     * chặn hoàn thành, báo nạp thêm, thay vì để SQL nổ giữa chừng.
     */
    private function settleCompletion(Booking $booking, $driver): ?string
    {
        $booking = Booking::lockForUpdate()->find($booking->id);
        if ($booking->status !== 'in_progress' || $booking->driver_id !== $driver->id) {
            return 'Chuyển trạng thái không hợp lệ.';
        }

        if ($booking->chargedOnAccept()) {
            // Đã trừ tài xế lúc nhận — cộng CTV đúng số đã giữ, không tính lại theo
            // collection_fee hiện tại (admin có thể đã sửa sau khi tài xế nhận).
            $collabPoints = $booking->collaborator_id ? $booking->held_collection_points : 0;
        } else {
            // Cuốc nhận trước bản trừ-lúc-nhận: trừ tài xế tại đây như cũ.
            $collabPoints = $booking->collectionPoints();
            $owed = $booking->surchargePoints() + $collabPoints;

            if ($owed > 0) {
                $wallet = Wallet::lockedFor($driver->id);

                if ($wallet->points < $owed) {
                    return "Ví cần {$owed} điểm (thu hộ / phí phạt huỷ của cuốc này) để hoàn thành, "
                        ."ví còn {$wallet->points} điểm. Vui lòng nạp thêm điểm rồi bấm hoàn thành lại.";
                }

                $wallet->debit($booking->surchargePoints(), "Phí phạt huỷ khách cuốc #{$booking->id}", $booking->id);
                $wallet->debit($collabPoints, "Thu hộ cuốc #{$booking->id}", $booking->id);
            }
        }

        // CTV nhận 100% thu hộ — công ty KHÔNG cắt phí app trên khoản này.
        if ($collabPoints > 0) {
            Wallet::lockedFor($booking->collaborator_id)
                ->credit($collabPoints, "Thu hộ cuốc #{$booking->id}", $booking->id);
        }

        $driver->driverProfile?->increment('trips_count');
        $booking->update(['status' => 'completed']);

        return null;
    }

    /** Memo theo request: formatTrip chạy cho từng cuốc trong danh sách, tránh query app_settings N lần. */
    private ?float $feePercent = null;

    private function feePercent(): float
    {
        return $this->feePercent ??= AppSetting::appFeePercent();
    }

    private function formatTrip(Booking $b, $driverProfile = null): array
    {
        // Phí app chỉ tính trên giá cuốc sau voucher, KHÔNG tính trên tiền thu hộ.
        $effectivePrice = $b->price - $b->discount;
        $feePercent = $this->feePercent();
        $appFee = (int) round($effectivePrice * $feePercent / 100);
        $netEarning = $effectivePrice - $appFee;
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
            'vehicle_type' => $b->vehicle_type,
            'is_vip' => (bool) $b->is_vip,
            'duration_min' => $durationMin,
            'price' => $b->price,
            'discount' => $b->discount,
            'surcharge' => $b->surcharge,
            'collection_fee' => (int) ($b->collection_fee ?? 0),
            'final_price' => $b->price - $b->discount + $b->surcharge + ($b->collection_fee ?? 0),
            'app_fee' => $appFee,
            'app_fee_percent' => $feePercent,
            // Tổng điểm ví bị trừ lúc NHẬN cuốc: phí app + tạm giữ thu hộ + phí phạt huỷ.
            // Cùng Booking::appFeePoints() với accept() nên khớp thông báo lỗi.
            // Tách riêng từng khoản để app ghi đúng chữ (cuốc có collection_fee mà không
            // có CTV thì KHÔNG bị giữ thu hộ — xem Booking::collectionPoints()).
            'collection_points' => $b->collectionPoints(),
            'surcharge_points' => $b->surchargePoints(),
            'required_points' => $b->appFeePoints($feePercent / 100) + $b->collectionPoints() + $b->surchargePoints(),
            'net_earning' => $netEarning,
            'status' => $statusMap[$b->status] ?? $b->status,
            'cancelled_at' => $b->cancelled_at?->toISOString(),
            'cancelled_by' => $b->cancelled_by,
            'cancel_reason' => $b->cancel_reason,
            'is_new' => $b->created_at?->gt(now()->subMinutes(30)) ?? false,
            'customer_name' => $b->customer?->name,
            'customer_phone' => $phone,
            'customer_phone_masked' => $phone ? substr($phone, 0, -3).'***' : '',
            'customer_note' => $b->note,
            'created_at' => $b->created_at?->toISOString(),
            'distance_to_driver' => $distanceToDriver,
        ];
    }

    /**
     * Định dạng một cuốc mà TÀI XẾ NÀY từng bỏ (BookingDriverCancellation), độc
     * lập với trạng thái/driver_id HIỆN TẠI của booking (có thể đã được tài xế
     * khác nhận và hoàn thành). Với chính tài xế đã bỏ, cuốc này luôn hiển thị
     * là "đã huỷ, bởi tài xế" — và không có thu nhập vì họ chưa từng hoàn thành nó.
     */
    private function formatDriverDrop(BookingDriverCancellation $log, $driverProfile = null): array
    {
        $base = $this->formatTrip($log->booking, $driverProfile);

        return array_merge($base, [
            'status' => 'cancelled',
            'cancelled_at' => $log->cancelled_at->toISOString(),
            'cancelled_by' => 'driver',
            'cancel_reason' => $log->reason,
            'app_fee' => 0,
            'net_earning' => 0,
        ]);
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
