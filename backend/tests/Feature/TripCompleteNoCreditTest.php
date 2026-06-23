<?php
// backend/tests/Feature/TripCompleteNoCreditTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripCompleteNoCreditTest extends TestCase
{
    use RefreshDatabase;

    public function test_completing_trip_does_not_credit_wallet_points(): void
    {
        Notification::fake();

        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => 500]);

        $booking = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'in_progress',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(500, $wallet->fresh()->points);
    }

    public function test_completing_trip_increments_trips_count(): void
    {
        Notification::fake();

        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);
        $profile  = $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00001',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'trips_count'   => 0,
        ]);

        Wallet::create(['user_id' => $driver->id, 'points' => 500]);

        $booking = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'in_progress',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(1, $profile->fresh()->trips_count);
    }
}
