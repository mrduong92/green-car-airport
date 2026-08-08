<?php
namespace App\Jobs;

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
        // Chỉ bắn cho tài xế có xe CHỞ ĐƯỢC cuốc này. Thiếu bộ lọc này thì tài
        // xế xe 4 chỗ nhận noti cuốc 5 chỗ rồi bấm vào thấy danh sách rỗng, vì
        // TripController::index() lọc theo đúng quy tắc sức chứa.
        // Xe chưa khai loại (vehicle_type NULL) vẫn được nhận — khớp nhánh
        // phòng thủ "không rõ loại thì cho phép tất cả" của VehicleCapacity.
        $fittingTypes = VehicleCapacity::driverTypesFittingBooking($this->booking->vehicle_type);

        User::where('role', 'driver')
            ->whereHas('driverProfile', fn ($q) => $q
                ->where('status', 'active')
                ->where('is_online', true)
                ->where(fn ($q2) => $q2
                    ->whereIn('vehicle_type', $fittingTypes)
                    ->orWhereNull('vehicle_type')))
            ->each(fn ($driver) => $driver->notify(new NewBookingAvailableNotification($this->booking)));
    }
}
