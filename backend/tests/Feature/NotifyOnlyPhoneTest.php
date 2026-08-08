<?php

// backend/tests/Feature/NotifyOnlyPhoneTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Notifications\BookingCreatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification as NotificationFacade;
use Tests\TestCase;

/**
 * Van an toàn NOTIFY_ONLY_PHONE. Sai theo hướng nào cũng tệ:
 * - chặn hụt  → test trên production làm phiền người dùng thật, tốn tiền ZNS
 * - chặn thừa → cả hệ thống ngừng gửi thông báo mà không có lỗi nào
 */
class NotifyOnlyPhoneTest extends TestCase
{
    use RefreshDatabase;

    private function booking(User $customer): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id,
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

    public function test_khong_dat_bien_thi_gui_binh_thuong(): void
    {
        config(['services.notify_only_phone' => null]);
        $u = User::factory()->create(['role' => 'customer', 'phone' => '0900000001']);

        NotificationFacade::fake();
        $u->notify(new BookingCreatedNotification($this->booking($u)));

        NotificationFacade::assertSentTo($u, BookingCreatedNotification::class);
    }

    public function test_so_duoc_phep_van_nhan_duoc(): void
    {
        config(['services.notify_only_phone' => '0868968312']);
        $u = User::factory()->create(['role' => 'customer', 'phone' => '0868968312']);

        NotificationFacade::fake();
        $u->notify(new BookingCreatedNotification($this->booking($u)));

        NotificationFacade::assertSentTo($u, BookingCreatedNotification::class);
    }

    public function test_so_khac_bi_chan(): void
    {
        config(['services.notify_only_phone' => '0868968312']);
        $u = User::factory()->create(['role' => 'customer', 'phone' => '0912345678']);

        // KHÔNG dùng Notification::fake() ở đây: fake() thay thế cả pipeline nên
        // event NotificationSending không chạy và listener sẽ không được gọi —
        // test sẽ xanh dù van an toàn hỏng. Phải để pipeline thật chạy rồi kiểm
        // hệ quả quan sát được: notification không được ghi vào bảng.
        $u->notify(new BookingCreatedNotification($this->booking($u)));

        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_so_duoc_phep_van_ghi_vao_database(): void
    {
        config(['services.notify_only_phone' => '0868968312']);
        $u = User::factory()->create(['role' => 'customer', 'phone' => '0868968312']);

        $u->notify(new BookingCreatedNotification($this->booking($u)));

        $this->assertDatabaseCount('notifications', 1);
    }
}
