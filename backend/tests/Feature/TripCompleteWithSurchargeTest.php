<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripCompleteWithSurchargeTest extends TestCase
{
    use RefreshDatabase;

    private function setupInProgressBooking(int $surcharge): array
    {
        Notification::fake();
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);
        $wallet   = Wallet::create(['user_id' => $driver->id, 'points' => 100]);

        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-99999',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'trips_count'   => 0,
        ]);

        $booking = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 350_000,
            'discount'     => 0,
            'surcharge'    => $surcharge,
            'status'       => 'in_progress',
            'accepted_at'  => now()->subHour(),
        ]);

        return compact('driver', 'customer', 'booking', 'wallet');
    }

    /** Hoàn thành chuyến có surcharge=50k → trừ 50 points từ ví tài xế */
    public function test_complete_with_surcharge_deducts_points_from_driver_wallet(): void
    {
        ['driver' => $driver, 'booking' => $booking, 'wallet' => $wallet] = $this->setupInProgressBooking(50_000);

        $pointsBefore = $wallet->fresh()->points;

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $surchargePoints = (int) round(50_000 / 1000); // 50 points
        $this->assertEquals($pointsBefore - $surchargePoints, $wallet->fresh()->points);

        $this->assertDatabaseHas('wallet_transactions', [
            'wallet_id'  => $wallet->id,
            'booking_id' => $booking->id,
            'type'       => 'debit',
        ]);
    }

    /** Hoàn thành chuyến không có surcharge → không tạo debit transaction thêm */
    public function test_complete_without_surcharge_does_not_deduct_extra_points(): void
    {
        ['driver' => $driver, 'booking' => $booking, 'wallet' => $wallet] = $this->setupInProgressBooking(0);

        $pointsBefore = $wallet->fresh()->points;

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals($pointsBefore, $wallet->fresh()->points);
    }

    /** formatTrip trả về surcharge và final_price bao gồm surcharge */
    public function test_format_trip_includes_surcharge_in_final_price(): void
    {
        ['driver' => $driver, 'booking' => $booking] = $this->setupInProgressBooking(50_000);

        $response = $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(50_000,  $response->json('surcharge'));
        $this->assertEquals(400_000, $response->json('final_price')); // 350k + 50k
    }
}
