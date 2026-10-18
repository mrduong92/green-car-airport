<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\BookingMovedToStandardCarNotification;
use App\Notifications\DriverCancelledNotification;
use App\Notifications\WhitePlateTripReleasedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * `php artisan vip:retire` — chạy một lần khi gỡ cuốc VIP: cuốc VIP còn dở thành cuốc thường (giữ giá),
 * cuốc tài xế biển trắng đã nhận chưa chạy trả về sàn và hoàn đủ phí app, cuốc đang chạy để nguyên.
 */
class RetireVipCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function driver(bool $whitePlate): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry', 'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4',
            'white_plate' => $whitePlate, 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 100]);

        return $driver;
    }

    private function booking(string $status, bool $vip, ?User $driver = null, ?int $chargedFee = null): Booking
    {
        $b = Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'driver_id' => $driver?->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0, 'status' => $status,
            'accepted_at' => $driver ? now() : null,
            'charged_fee_points' => $chargedFee,
        ]);
        // bookings.is_vip không còn trong model (đã gỡ VIP) — cột giữ tạm cho đúng lệnh này.
        DB::table('bookings')->where('id', $b->id)->update(['is_vip' => $vip]);

        return $b;
    }

    private function isVip(Booking $b): bool
    {
        return (bool) DB::table('bookings')->where('id', $b->id)->value('is_vip');
    }

    public function test_waiting_vip_booking_becomes_standard_and_customer_told(): void
    {
        $b = $this->booking('finding_driver', vip: true);

        $this->artisan('vip:retire')->assertSuccessful();

        $this->assertFalse($this->isVip($b));
        $this->assertSame('finding_driver', $b->fresh()->status);
        $this->assertSame(500_000, $b->fresh()->price);
        Notification::assertSentTo($b->customer, BookingMovedToStandardCarNotification::class);
    }

    public function test_white_plate_accepted_trip_released_with_full_fee_refund(): void
    {
        $driver = $this->driver(whitePlate: true);
        $vip = $this->booking('accepted', vip: true, driver: $driver, chargedFee: 80);
        $plain = $this->booking('accepted', vip: false, driver: $driver, chargedFee: 60);

        $this->artisan('vip:retire')->assertSuccessful();

        foreach ([$vip, $plain] as $b) {
            $b->refresh();
            $this->assertSame('finding_driver', $b->status);
            $this->assertNull($b->driver_id);
            $this->assertNull($b->accepted_at);
        }
        $this->assertSame(100 + 80 + 60, $driver->wallet->fresh()->points);
        $this->assertFalse($this->isVip($vip));
        Notification::assertSentTo($vip->customer, BookingMovedToStandardCarNotification::class);
        Notification::assertSentTo($plain->customer, DriverCancelledNotification::class);
        Notification::assertSentTo($driver, WhitePlateTripReleasedNotification::class, 2);
    }

    public function test_in_progress_and_yellow_plate_trips_untouched(): void
    {
        $white = $this->driver(whitePlate: true);
        $yellow = $this->driver(whitePlate: false);
        $running = $this->booking('in_progress', vip: true, driver: $white, chargedFee: 80);
        $yellowTrip = $this->booking('accepted', vip: false, driver: $yellow, chargedFee: 60);

        $this->artisan('vip:retire')->assertSuccessful();

        $this->assertSame('in_progress', $running->fresh()->status);
        $this->assertSame($white->id, $running->fresh()->driver_id);
        $this->assertSame('accepted', $yellowTrip->fresh()->status);
        $this->assertSame(100, $white->wallet->fresh()->points);
    }

    public function test_running_twice_is_harmless(): void
    {
        $driver = $this->driver(whitePlate: true);
        $this->booking('accepted', vip: true, driver: $driver, chargedFee: 80);

        $this->artisan('vip:retire')->assertSuccessful();
        $this->artisan('vip:retire')->assertSuccessful();

        $this->assertSame(180, $driver->wallet->fresh()->points);
    }

    public function test_admin_marking_white_plate_releases_their_accepted_trips(): void
    {
        $driver = $this->driver(whitePlate: false);
        $b = $this->booking('accepted', vip: false, driver: $driver, chargedFee: 60);
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')->putJson("/api/admin/drivers/{$driver->id}", ['white_plate' => true])->assertOk();

        $this->assertSame('finding_driver', $b->fresh()->status);
        $this->assertSame(160, $driver->wallet->fresh()->points);
    }
}
