<?php

namespace App\Http\Controllers\Customer;

use App\Events\DriverTripsUpdated;
use App\Http\Controllers\Controller;
use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Notifications\BookingCreatedNotification;
use App\Notifications\CustomerCancelledNotification;
use App\Support\AvailableTripsCache;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    private const VOUCHER_MAX_RATE = 0.10;

    /** Số chuyến mỗi trang lịch sử. */
    private const HISTORY_PER_PAGE = 20;

    /**
     * Lịch sử chuyến, phân trang bằng cursor.
     *
     * Trước đây `->get()` không giới hạn — khách đi 300 chuyến là tải về đủ 300
     * kèm quan hệ driver + driverProfile + voucher, mỗi lần mở màn hình lịch sử.
     *
     * Dùng cursor thay vì offset: dữ liệu sắp theo thời gian và luôn có bản ghi
     * mới chèn lên đầu, offset sẽ làm lặp/nhảy bản ghi giữa các trang.
     */
    public function index(Request $request): JsonResponse
    {
        $page = Booking::with(['driver.driverProfile', 'voucher'])
            ->where('customer_id', $request->user()->id)
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            // ⚠️ Phải có tiebreaker `id`: cursor pagination sinh mệnh đề
            // `WHERE created_at < X`, nên nhiều bản ghi TRÙNG created_at (đặt
            // hàng loạt trong cùng một giây) sẽ bị loại sạch ở trang sau —
            // `latest()` đơn thuần trả về trang 2 rỗng.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->cursorPaginate(self::HISTORY_PER_PAGE);

        return response()->json([
            'data' => collect($page->items())->map(fn ($b) => $this->formatBooking($b))->values(),
            'next_cursor' => $page->nextCursor()?->encode(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pickup' => 'required|string',
            'pickup_lat' => 'nullable|numeric|between:-90,90',
            'pickup_lng' => 'nullable|numeric|between:-180,180',
            'destination' => 'required|string',
            'destination_lat' => 'nullable|numeric|between:-90,90',
            'destination_lng' => 'nullable|numeric|between:-180,180',
            'date' => 'required|date_format:Y-m-d|after_or_equal:today',
            'time' => 'required|date_format:H:i',
            'vehicle_type' => 'required|in:sedan_4,suv_5,mpv_7',
            'distance_km' => 'required|numeric|min:0',
            'price' => 'required|integer|min:0',
            'voucher_code' => 'nullable|string',
            'note' => 'nullable|string|max:500',
            'collection_fee' => 'nullable|integer|min:0',
            'is_vip' => 'sometimes|boolean',
        ]);

        // Giờ đặt xe hôm nay phải cách ít nhất 30 phút so với hiện tại
        if ($data['date'] === now()->toDateString()) {
            $bookingTime = Carbon::createFromFormat('H:i', $data['time']);
            if ($bookingTime->lte(now()->addMinutes(30))) {
                return response()->json(['message' => 'Giờ đón phải cách ít nhất 30 phút so với thời điểm đặt xe.'], 422);
            }
        }

        $collectionFee = (int) ($data['collection_fee'] ?? 0);
        $collaboratorId = null;
        if ($collectionFee > 0) {
            if (! $request->user()->is_collaborator) {
                return response()->json(['message' => 'Chỉ Cộng Tác Viên mới được dùng tính năng Thu Hộ.'], 422);
            }
            $collaboratorId = $request->user()->id;
        }

        $discount = 0;
        $voucherId = null;
        $customer = $request->user();
        $surcharge = $customer->pending_penalty;
        if ($surcharge > 0) {
            $customer->update(['pending_penalty' => 0]);
        }

        if (! empty($data['voucher_code'])) {
            $voucher = Voucher::where('code', $data['voucher_code'])
                ->where('is_active', true)
                ->where('expires_at', '>=', today())
                ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('usage_count', '<', 'usage_limit'))
                // Cùng quy tắc với VoucherController::apply(): voucher cá nhân chỉ chủ sở hữu dùng được
                ->where(function ($q) use ($request) {
                    $q->where('target', 'all')
                        ->orWhere(fn ($q2) => $q2->where('target', 'specific')->where('user_id', $request->user()->id));
                })
                ->first();

            if ($voucher) {
                $raw = $voucher->type === 'fixed'
                    ? $voucher->value
                    : (int) round($data['price'] * $voucher->value / 100);
                $discount = min($raw, (int) floor($data['price'] * self::VOUCHER_MAX_RATE));
                $voucherId = $voucher->id;
                $voucher->increment('usage_count');
            }
        }

        $booking = Booking::create([
            'customer_id' => $request->user()->id,
            'pickup' => $data['pickup'],
            'pickup_lat' => $data['pickup_lat'] ?? null,
            'pickup_lng' => $data['pickup_lng'] ?? null,
            'destination' => $data['destination'],
            'destination_lat' => $data['destination_lat'] ?? null,
            'destination_lng' => $data['destination_lng'] ?? null,
            'date' => $data['date'],
            'time' => $data['time'],
            'distance_km' => $data['distance_km'],
            'price' => $data['price'],
            'discount' => $discount,
            'surcharge' => $surcharge,
            'voucher_id' => $voucherId,
            'status' => 'finding_driver',
            'vehicle_type' => $data['vehicle_type'],
            'is_vip' => $request->boolean('is_vip'),
            'note' => $data['note'] ?? null,
            'collection_fee' => $collectionFee,
            'collaborator_id' => $collaboratorId,
        ]);

        // Cuốc mới vào sàn — vô hiệu hoá cache danh sách. Bỏ bước này thì tài xế
        // nhận được thông báo "có cuốc mới" rồi mở app ra lại thấy danh sách cũ.
        AvailableTripsCache::flush();

        DriverTripsUpdated::dispatch('new_booking', $booking->id);

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

        if (! $booking) {
            // response()->json(null) returns "{}" in some Symfony versions;
            // setContent bypasses that to produce the proper JSON null literal.
            return (new JsonResponse)->setContent('null');
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

        // Fix 1: thêm 'accepted' vào danh sách trạng thái được phép huỷ
        if (! in_array($booking->status, ['finding_driver', 'accepted'])) {
            return response()->json(['message' => 'Không thể huỷ chuyến ở trạng thái này.'], 422);
        }

        $data = $request->validate([
            'cancel_reason' => 'nullable|string|max:255',
        ]);

        // Khoá + kiểm lại trạng thái TRONG transaction. Không khoá thì request này dùng
        // bản booking đọc trước đó: tài xế vừa nhận (đã bị trừ phí + tạm giữ) mà bản cũ
        // còn driver_id = null → huỷ không hoàn gì; hoặc tài xế cũng đang huỷ → hoàn 2 lần.
        $error = DB::transaction(function () use ($booking, $request, $data) {
            $booking = Booking::lockForUpdate()->find($booking->id);
            if (! in_array($booking->status, ['finding_driver', 'accepted'])) {
                return 'Không thể huỷ chuyến ở trạng thái này.';
            }

            // Phạt 50,000đ nếu huỷ sau 60 phút kể từ khi tài xế nhận cuốc
            if ($booking->accepted_at && now()->diffInMinutes($booking->accepted_at, false) < -60) {
                $request->user()->increment('pending_penalty', 50_000);
            }

            // Hoàn cho tài xế đã nhận: phí app + khoản tạm giữ, theo ĐÚNG số đã trừ lúc nhận.
            if ($booking->chargedOnAccept()) {
                $booking->refundAcceptCharges('khách', refundFee: true);
            } elseif ($booking->driver_id) {
                // Cuốc nhận trước bản trừ-lúc-nhận: không có số đã ghi, tính lại phí như cũ.
                Wallet::lockedFor($booking->driver_id)->credit(
                    $booking->appFeePoints(AppSetting::appFeeRate()),
                    "Hoàn phí app cuốc #{$booking->id} (khách huỷ)",
                    $booking->id,
                );
            }

            $booking->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => 'customer',
                'cancel_reason' => $data['cancel_reason'] ?? null,
            ]);

            return null;
        });

        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        $booking->refresh();

        $request->user()->notify(new CustomerCancelledNotification($booking));

        // Khách huỷ — cuốc rời sàn, vô hiệu hoá cache danh sách.
        AvailableTripsCache::flush();

        DriverTripsUpdated::dispatch('booking_cancelled', $booking->id, $booking->driver_id);

        // Voucher usage_count đã tăng khi đặt; huỷ chuyến KHÔNG hoàn lại — đây là thiết kế có chủ đích.
        return response()->json($this->formatBooking($booking->fresh(['driver.driverProfile', 'voucher'])));
    }

    private function formatBooking(Booking $b): array
    {
        $driver = $b->driver;
        $profile = $driver?->driverProfile;

        return [
            'id' => $b->id,
            'pickup' => $b->pickup,
            'pickup_lat' => $b->pickup_lat ? (float) $b->pickup_lat : null,
            'pickup_lng' => $b->pickup_lng ? (float) $b->pickup_lng : null,
            'destination' => $b->destination,
            'destination_lat' => $b->destination_lat ? (float) $b->destination_lat : null,
            'destination_lng' => $b->destination_lng ? (float) $b->destination_lng : null,
            'date' => $b->date,
            'time' => $b->time,
            'distance_km' => (float) $b->distance_km,
            'price' => $b->price,
            'discount' => $b->discount,
            'surcharge' => $b->surcharge,
            'final_price' => $b->price - $b->discount + $b->surcharge + ($b->collection_fee ?? 0),
            'voucher_code' => $b->voucher?->code,
            'note' => $b->note,
            'collection_fee' => $b->collection_fee ?? 0,
            'status' => $b->status,
            'cancel_reason' => $b->cancel_reason,
            'vehicle_type' => $b->vehicle_type,
            'is_vip' => (bool) $b->is_vip,
            'created_at' => $b->created_at?->toISOString(),
            'accepted_at' => $b->accepted_at?->toISOString(),
            'driver' => $driver ? [
                'id' => $driver->id,
                'name' => $driver->name,
                'phone' => $driver->phone,
                'vehicle_make' => $profile?->vehicle_make,
                'vehicle_model' => $profile?->vehicle_model,
                'vehicle_plate' => $profile?->vehicle_plate,
                'vehicle_color' => $profile?->vehicle_color,
                'rating' => $profile?->rating,
            ] : null,
        ];
    }
}
