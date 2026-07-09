<?php
// backend/tests/Feature/TripVehicleCapacityTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripVehicleCapacityTest extends TestCase
{
    use RefreshDatabase;

    private function makeActiveDriver(?string $vehicleType, int $points = 1000): array
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type'  => $vehicleType,
            'status'        => 'active',
        ]);
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => $points]);

        return [$driver, $wallet];
    }

    private function makeFindingBooking(string $vehicleType): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => $vehicleType,
            'distance_km'  => 30,
            'price'        => 500_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);
    }

    public function test_index_hides_bookings_requiring_bigger_vehicle(): void
    {
        [$driver] = $this->makeActiveDriver('sedan_4');
        $sedan = $this->makeFindingBooking('sedan_4');
        $this->makeFindingBooking('suv_5');
        $this->makeFindingBooking('mpv_7');

        $response = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips');

        $response->assertOk();
        $ids = collect($response->json())->pluck('id')->all();
        $this->assertEquals([$sedan->id], $ids);
    }

    public function test_index_shows_all_when_driver_vehicle_type_missing(): void
    {
        [$driver] = $this->makeActiveDriver(null);
        $this->makeFindingBooking('sedan_4');
        $this->makeFindingBooking('suv_5');
        $this->makeFindingBooking('mpv_7');

        $response = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips');

        $response->assertOk();
        $this->assertCount(3, $response->json());
    }

    public function test_index_shows_smaller_and_equal_vehicle_types_for_mpv7_driver(): void
    {
        [$driver] = $this->makeActiveDriver('mpv_7');
        $this->makeFindingBooking('sedan_4');
        $this->makeFindingBooking('suv_5');
        $this->makeFindingBooking('mpv_7');

        $response = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips');

        $response->assertOk();
        $this->assertCount(3, $response->json());
    }
}
