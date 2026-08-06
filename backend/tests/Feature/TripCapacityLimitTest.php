<?php
// backend/tests/Feature/TripCapacityLimitTest.php

namespace Tests\Feature;

use App\Http\Controllers\Driver\TripController;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripCapacityLimitTest extends TestCase
{
    use RefreshDatabase;

    /** Ba trạng thái được tính là "đang thực hiện" trong TripController::accept() */
    private const ACTIVE_STATUSES = ['accepted', 'picking_up', 'in_progress'];

    private function makeActiveDriver(): array
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00003',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'status'        => 'active',
        ]);
        // Dư điểm để 422 (nếu có) chắc chắn đến từ giới hạn cuốc, không phải thiếu ví
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);

        return [$driver, $wallet];
    }

    private function makeBooking(string $status, ?int $driverId = null): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driverId,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 500_000, // phí app 20% = 100 điểm
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => $status,
        ]);
    }

    /**
     * Gán cho tài xế $count cuốc đang thực hiện, xoay vòng qua cả 3 trạng thái
     * active để test luôn việc picking_up / in_progress cũng được tính.
     */
    private function giveDriverActiveTrips(User $driver, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $this->makeBooking(self::ACTIVE_STATUSES[$i % 3], $driver->id);
        }
    }

    public function test_accept_succeeds_at_one_trip_below_capacity(): void
    {
        Notification::fake();
        [$driver] = $this->makeActiveDriver();
        $this->giveDriverActiveTrips($driver, TripController::MAX_ACTIVE_TRIPS - 1);
        $booking = $this->makeBooking('finding_driver');

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        $this->assertEquals('accepted', $booking->fresh()->status);
        $this->assertEquals($driver->id, $booking->fresh()->driver_id);

        $activeCount = Booking::where('driver_id', $driver->id)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->count();
        $this->assertEquals(TripController::MAX_ACTIVE_TRIPS, $activeCount);
    }

    public function test_accept_rejected_when_driver_at_capacity(): void
    {
        Notification::fake();
        [$driver, $wallet] = $this->makeActiveDriver();
        $this->giveDriverActiveTrips($driver, TripController::MAX_ACTIVE_TRIPS);
        $booking = $this->makeBooking('finding_driver');

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422)
            ->assertJson([
                'message' => 'Bạn đã đạt tối đa '.TripController::MAX_ACTIVE_TRIPS.' cuốc đang thực hiện.',
            ]);

        // Cuốc vẫn còn trên sàn, ví không bị trừ phí app
        $this->assertEquals('finding_driver', $booking->fresh()->status);
        $this->assertNull($booking->fresh()->driver_id);
        $this->assertEquals(10_000, $wallet->fresh()->points);
        $this->assertDatabaseMissing('wallet_transactions', ['booking_id' => $booking->id]);
    }

    public function test_completed_and_cancelled_trips_do_not_count_toward_capacity(): void
    {
        Notification::fake();
        [$driver] = $this->makeActiveDriver();

        // Quá hạn mức nếu đếm sai: mỗi loại đã bằng đúng hạn mức
        for ($i = 0; $i < TripController::MAX_ACTIVE_TRIPS; $i++) {
            $this->makeBooking('completed', $driver->id);
            $this->makeBooking('cancelled', $driver->id);
        }
        $booking = $this->makeBooking('finding_driver');

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        $this->assertEquals('accepted', $booking->fresh()->status);
    }
}
