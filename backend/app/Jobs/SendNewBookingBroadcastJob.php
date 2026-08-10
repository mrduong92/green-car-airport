<?php

namespace App\Jobs;

use App\Http\Controllers\Driver\TripController;
use App\Models\Booking;
use App\Models\User;
use App\Notifications\NewBookingAvailableNotification;
use App\Support\VehicleCapacity;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendNewBookingBroadcastJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private Booking $booking) {}

    public function handle(): void
    {
        // Job nằm trong hàng đợi một lúc mới tới lượt chạy; trong khoảng đó cuốc
        // có thể đã được người khác nhận hoặc khách đã huỷ. Bắn tiếp là làm
        // phiền hàng trăm tài xế bằng một cuốc bấm vào chỉ nhận về lỗi 422.
        //
        // SerializesModels nạp lại model từ DB lúc job chạy, nên `status` ở đây
        // đã là giá trị hiện tại chứ không phải giá trị lúc dispatch.
        if ($this->booking->status !== 'finding_driver') {
            return;
        }

        // Chỉ bắn cho tài xế có xe CHỞ ĐƯỢC cuốc này. Thiếu bộ lọc này thì tài
        // xế xe 4 chỗ nhận noti cuốc 5 chỗ rồi bấm vào thấy danh sách rỗng, vì
        // TripController::index() lọc theo đúng quy tắc sức chứa.
        // Xe chưa khai loại (vehicle_type NULL) vẫn được nhận — khớp nhánh
        // phòng thủ "không rõ loại thì cho phép tất cả" của VehicleCapacity.
        $fittingTypes = VehicleCapacity::driverTypesFittingBooking($this->booking->vehicle_type);

        // Cuốc VIP chỉ tới tài xế xe cá nhân. Không lọc ở đây thì tài xế thường
        // nhận noti rồi bấm vào chỉ ăn 422 — đúng thứ bộ lọc loại xe sinh ra để
        // tránh.
        $bookingIsVip = (bool) $this->booking->is_vip;

        User::where('role', 'driver')
            ->whereHas('driverProfile', fn ($q) => $q
                ->where('status', 'active')
                ->where('is_online', true)
                ->when($bookingIsVip, fn ($q2) => $q2->where('is_vip', true))
                ->where(fn ($q2) => $q2
                    ->whereIn('vehicle_type', $fittingTypes)
                    ->orWhereNull('vehicle_type')))
            // Bỏ qua tài xế đã kín việc: accept() chặn ở MAX_ACTIVE_TRIPS nên
            // họ có bấm nhận cũng chỉ ăn 422. Đây cũng là bộ lọc giảm tải tốt —
            // tài xế bận là nhóm KHÔNG cần biết về cuốc mới.
            //
            // Dùng whereHas(..., '<', n) chứ KHÔNG withCount()+having(): having
            // không kèm group by chạy được trên MySQL nhưng sqlite từ chối
            // ("HAVING clause on a non-aggregate query"), mà test chạy sqlite.
            ->whereHas(
                'bookingsAsDriver',
                fn ($q) => $q->whereIn('status', ['accepted', 'picking_up', 'in_progress']),
                '<',
                TripController::MAX_ACTIVE_TRIPS,
            )
            ->each(fn ($driver) => $driver->notify(new NewBookingAvailableNotification($this->booking)));
    }
}
