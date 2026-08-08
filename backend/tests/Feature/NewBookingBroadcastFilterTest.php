<?php

// backend/tests/Feature/NewBookingBroadcastFilterTest.php

namespace Tests\Feature;

use App\Http\Controllers\Driver\TripController;
use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\NewBookingAvailableNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Bộ lọc người nhận thông báo "có cuốc mới".
 *
 * Mỗi cuốc bắn cho MỌI tài xế online nên đây là nguồn tải lớn nhất của hàng đợi:
 * lọc hụt là hàng trăm job thừa mỗi cuốc, mà người nhận cũng chẳng làm gì được.
 */
class NewBookingBroadcastFilterTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(string $vehicleType = 'sedan_4'): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => $vehicleType,
            'status' => 'active',
            'is_online' => true,
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);

        return $driver;
    }

    private function makeBooking(string $status = 'finding_driver', ?int $driverId = null): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'driver_id' => $driverId,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => $status,
        ]);
    }

    public function test_khong_bao_cho_tai_xe_da_du_so_cuoc(): void
    {
        Notification::fake();

        $ranh = $this->makeDriver();
        $kinViec = $this->makeDriver();
        for ($i = 0; $i < TripController::MAX_ACTIVE_TRIPS; $i++) {
            $this->makeBooking('accepted', $kinViec->id);
        }

        (new SendNewBookingBroadcastJob($this->makeBooking()))->handle();

        Notification::assertSentTo($ranh, NewBookingAvailableNotification::class);
        // accept() chặn ở MAX_ACTIVE_TRIPS nên tài xế này có bấm nhận cũng chỉ ăn 422
        Notification::assertNotSentTo($kinViec, NewBookingAvailableNotification::class);
    }

    public function test_tai_xe_con_thieu_dung_mot_cuoc_van_duoc_bao(): void
    {
        Notification::fake();

        $ganDu = $this->makeDriver();
        for ($i = 0; $i < TripController::MAX_ACTIVE_TRIPS - 1; $i++) {
            $this->makeBooking('accepted', $ganDu->id);
        }

        (new SendNewBookingBroadcastJob($this->makeBooking()))->handle();

        Notification::assertSentTo($ganDu, NewBookingAvailableNotification::class);
    }

    public function test_cuoc_da_hoan_thanh_khong_tinh_vao_han_muc(): void
    {
        Notification::fake();

        $driver = $this->makeDriver();
        for ($i = 0; $i < TripController::MAX_ACTIVE_TRIPS; $i++) {
            $this->makeBooking('completed', $driver->id);
        }

        (new SendNewBookingBroadcastJob($this->makeBooking()))->handle();

        Notification::assertSentTo($driver, NewBookingAvailableNotification::class);
    }

    public function test_khong_bao_khi_cuoc_da_bi_nguoi_khac_nhan(): void
    {
        Notification::fake();

        $driver = $this->makeDriver();
        $nguoiKhac = $this->makeDriver();

        // Job nằm hàng đợi, tới lúc chạy thì cuốc đã được nhận
        $booking = $this->makeBooking('accepted', $nguoiKhac->id);

        (new SendNewBookingBroadcastJob($booking))->handle();

        Notification::assertNothingSent();
    }

    public function test_khong_bao_khi_khach_da_huy(): void
    {
        Notification::fake();

        $this->makeDriver();
        $booking = $this->makeBooking('cancelled');

        (new SendNewBookingBroadcastJob($booking))->handle();

        Notification::assertNothingSent();
    }

    public function test_van_bao_binh_thuong_khi_cuoc_con_trong(): void
    {
        Notification::fake();

        $driver = $this->makeDriver();

        (new SendNewBookingBroadcastJob($this->makeBooking()))->handle();

        Notification::assertSentTo($driver, NewBookingAvailableNotification::class);
    }
}
