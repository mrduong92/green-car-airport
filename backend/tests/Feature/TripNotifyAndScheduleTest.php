<?php
// backend/tests/Feature/TripNotifyAndScheduleTest.php

namespace Tests\Feature;

use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\NewBookingAvailableNotification;
use App\Support\VehicleCapacity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripNotifyAndScheduleTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(string $vehicleType, bool $online = true): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-' . substr((string) $driver->id, -5),
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type'  => $vehicleType,
            'status'        => 'active',
            'is_online'     => $online,
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);

        return $driver;
    }

    private function makeBooking(string $vehicleType, string $date, string $time, string $status = 'finding_driver', ?int $driverId = null): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driverId,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => $date,
            'time'         => $time,
            'vehicle_type' => $vehicleType,
            'distance_km'  => 30,
            'price'        => 500_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => $status,
        ]);
    }

    // ── BUG 1: push bắn cho tài xế không chở nổi cuốc ────────────────────────

    /**
     * Cuốc xe 5 chỗ KHÔNG được đẩy noti cho tài xế xe 4 chỗ: họ bấm vào sẽ không
     * thấy cuốc nào, vì TripController::index() lọc theo sức chứa xe.
     */
    public function test_khong_gui_noti_cho_tai_xe_xe_nho_hon_cuoc(): void
    {
        Notification::fake();

        $sedan = $this->makeDriver('sedan_4');
        $booking = $this->makeBooking('suv_5', now()->addDay()->format('Y-m-d'), '08:00');

        (new SendNewBookingBroadcastJob($booking))->handle();

        Notification::assertNotSentTo($sedan, NewBookingAvailableNotification::class);
    }

    /** Tài xế xe đủ lớn thì vẫn phải nhận noti. */
    public function test_van_gui_noti_cho_tai_xe_xe_du_lon(): void
    {
        Notification::fake();

        $suv = $this->makeDriver('suv_5');
        $mpv = $this->makeDriver('mpv_7');
        $booking = $this->makeBooking('suv_5', now()->addDay()->format('Y-m-d'), '08:00');

        (new SendNewBookingBroadcastJob($booking))->handle();

        Notification::assertSentTo($suv, NewBookingAvailableNotification::class);
        Notification::assertSentTo($mpv, NewBookingAvailableNotification::class);
    }

    /** Tài xế offline vẫn không nhận noti (hành vi cũ, không được phá). */
    public function test_khong_gui_noti_cho_tai_xe_offline(): void
    {
        Notification::fake();

        $offline = $this->makeDriver('mpv_7', online: false);
        $booking = $this->makeBooking('sedan_4', now()->addDay()->format('Y-m-d'), '08:00');

        (new SendNewBookingBroadcastJob($booking))->handle();

        Notification::assertNotSentTo($offline, NewBookingAvailableNotification::class);
    }

    /**
     * Hai chiều của quy tắc sức chứa phải khớp nhau với MỌI cặp:
     * "cuốc X hợp với tài xế Y" ⟺ "Y nằm trong danh sách tài xế chở được X"
     * ⟺ "X nằm trong danh sách cuốc mà Y nhận được".
     *
     * Đây là chốt chặn cho đúng loại lỗi vừa gặp: danh sách cuốc lọc một đằng,
     * push bắn một nẻo.
     *
     * ⚠️ TripController hiện VẪN giữ bản sao riêng của quy tắc này (không gộp
     * được vì file đang có thay đổi Reverb chưa commit của người khác). Khi
     * Reverb xong thì cho TripController gọi VehicleCapacity và xoá bản sao.
     */
    public function test_hai_chieu_quy_tac_suc_chua_khop_nhau(): void
    {
        $types = array_keys(VehicleCapacity::RANK);

        foreach ($types as $bookingType) {
            foreach ($types as $driverType) {
                $fits = VehicleCapacity::fits($bookingType, $driverType);

                $this->assertSame(
                    $fits,
                    in_array($driverType, VehicleCapacity::driverTypesFittingBooking($bookingType), true),
                    "driverTypesFittingBooking lệch với fits() ở cuốc={$bookingType} tài xế={$driverType}",
                );

                $this->assertSame(
                    $fits,
                    in_array($bookingType, VehicleCapacity::bookingTypesFittingDriver($driverType), true),
                    "bookingTypesFittingDriver lệch với fits() ở cuốc={$bookingType} tài xế={$driverType}",
                );
            }
        }
    }

    // ── Chuyển trạng thái KHÔNG ràng buộc giờ hẹn (cố ý) ─────────────────────

    /**
     * CỐ Ý KHÔNG chặn theo giờ hẹn — quyết định của chủ app ngày 2026-08-08:
     * "cho thoải mái, không chặn giờ; miễn nó với khách hoàn thành, mình thu phí".
     *
     * Tài xế bắt đầu/hoàn thành sớm là chuyện giữa họ và khách (đón sớm, khách
     * đổi giờ, bay sớm...). Nền tảng vẫn thu 20% phí app như thường.
     *
     * Test này để GHI LẠI quyết định: nếu sau này ai thêm ràng buộc giờ, test
     * sẽ đỏ và buộc phải bàn lại thay vì lặng lẽ đổi hành vi.
     */
    public function test_co_y_cho_phep_hoan_thanh_cuoc_truoc_gio_hen(): void
    {
        $driver  = $this->makeDriver('sedan_4');
        $booking = $this->makeBooking(
            'sedan_4',
            now()->addDays(3)->format('Y-m-d'),   // cuốc của 3 ngày sau
            '08:00',
            'accepted',
            $driver->id,
        );

        $this->actingAs($driver)
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'in_progress'])
            ->assertOk();

        $this->actingAs($driver)
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame('completed', $booking->fresh()->status);
    }
}
