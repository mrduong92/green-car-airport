<?php

namespace Tests\Feature;

use App\Jobs\SendNewBookingBroadcastJob;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\NewBookingAvailableNotification;
use App\Support\AvailableTripsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Xe biển trắng (xe cá nhân) chở khách lấy tiền là vi phạm quy định vận tải: tài xế có cờ white_plate
 * không thấy, không nhận, không được báo cuốc nào cho tới khi admin xác nhận đã đổi sang biển vàng.
 */
class WhitePlateDriverTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // flush() đầu tiên trên key chưa tồn tại là no-op (xem AvailableTripsListTest).
        AvailableTripsCache::flush();
    }

    private function makeDriver(bool $whitePlate): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry', 'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4',
            'white_plate' => $whitePlate, 'status' => 'active', 'is_online' => true,
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);

        return $driver;
    }

    private function makeBooking(): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'finding_driver',
        ]);
    }

    public function test_white_plate_driver_sees_no_trips_even_from_shared_cache(): void
    {
        $booking = $this->makeBooking();
        // Tài xế biển vàng nạp cache trước — tài xế biển trắng không được đọc trúng entry đó.
        $this->actingAs($this->makeDriver(false), 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()->assertJsonPath('0.id', $booking->id);

        $this->actingAs($this->makeDriver(true), 'sanctum')->getJson('/api/driver/trips')->assertOk()->assertExactJson([]);
    }

    public function test_white_plate_driver_cannot_accept(): void
    {
        Notification::fake();
        $booking = $this->makeBooking();

        $this->actingAs($this->makeDriver(true), 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertForbidden()
            ->assertJsonPath('code', 'white_plate');

        $this->assertSame('finding_driver', $booking->fresh()->status);
        $this->assertNull($booking->fresh()->driver_id);
    }

    public function test_new_booking_not_pushed_to_white_plate_driver(): void
    {
        Notification::fake();
        $white = $this->makeDriver(true);
        $yellow = $this->makeDriver(false);

        (new SendNewBookingBroadcastJob($this->makeBooking()))->handle();

        Notification::assertSentTo($yellow, NewBookingAvailableNotification::class);
        Notification::assertNotSentTo($white, NewBookingAvailableNotification::class);
    }

    public function test_me_payload_carries_white_plate_flag(): void
    {
        $this->actingAs($this->makeDriver(true), 'sanctum')->getJson('/api/auth/me')->assertJsonPath('white_plate', true);
        $this->actingAs($this->makeDriver(false), 'sanctum')->getJson('/api/auth/me')->assertJsonPath('white_plate', false);
    }

    public function test_admin_switching_to_yellow_plate_unblocks(): void
    {
        $driver = $this->makeDriver(true);
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/drivers/{$driver->id}", ['white_plate' => false])
            ->assertOk()->assertJsonPath('white_plate', false);

        $booking = $this->makeBooking();
        $this->actingAs($driver->fresh(), 'sanctum')->getJson('/api/driver/trips')->assertJsonPath('0.id', $booking->id);
    }
}
