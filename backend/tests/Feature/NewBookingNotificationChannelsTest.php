<?php

// backend/tests/Feature/NewBookingNotificationChannelsTest.php

namespace Tests\Feature;

use App\Channels\WebPushChannel;
use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\Booking;
use App\Models\User;
use App\Notifications\BookingCreatedNotification;
use App\Notifications\NewBookingAvailableNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `NewBookingAvailableNotification` KHÔNG được ghi vào bảng notifications.
 *
 * Đây là loại duy nhất bắn cho MỌI tài xế online, nên số dòng nó sinh ra tăng
 * theo (số cuốc × số tài xế online) — ở 500 tài xế online sẽ chiếm >99% bảng.
 * Thêm lại `'database'` vào via() là một chỉnh sửa một dòng, rất dễ vô tình
 * khôi phục khi ai đó "thống nhất cho giống các notification khác".
 */
class NewBookingNotificationChannelsTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
            'is_online' => true,
        ]);

        return $driver;
    }

    private function makeBooking(): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
    }

    public function test_chi_gui_web_push_khong_co_kenh_database(): void
    {
        $kenh = (new NewBookingAvailableNotification($this->makeBooking()))
            ->via($this->makeDriver());

        $this->assertEquals([WebPushChannel::class], $kenh);
        $this->assertNotContains('database', $kenh, 'ghi vào DB là bảng notifications phình theo số tài xế online');
    }

    public function test_bao_cho_tai_xe_nhung_khong_de_lai_dong_nao_trong_bang(): void
    {
        $this->makeDriver();
        $booking = $this->makeBooking();

        // KHÔNG dùng Notification::fake(): fake() chặn cả pipeline nên không
        // chứng minh được là bảng không bị ghi. Để chạy thật rồi kiểm bảng.
        (new SendNewBookingBroadcastJob($booking))->handle();

        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_cac_notification_khac_van_ghi_vao_bang(): void
    {
        // Đối chứng: chỉ riêng loại "có cuốc mới" bị bỏ kênh database, các loại
        // khác vẫn phải lưu để người dùng xem lại được lịch sử thông báo.
        $customer = User::factory()->create(['role' => 'customer']);
        $customer->notify(new BookingCreatedNotification($this->makeBooking()));

        $this->assertDatabaseCount('notifications', 1);
    }
}
