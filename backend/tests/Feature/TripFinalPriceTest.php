<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TripFinalPriceTest extends TestCase
{
    use RefreshDatabase;

    public function test_trip_list_includes_discount_and_final_price(): void
    {
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 250_000,
            'discount'     => 25_000,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonPath('0.discount', 25_000)
            ->assertJsonPath('0.final_price', 225_000);
    }

    public function test_final_price_equals_price_when_no_discount(): void
    {
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 20,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonPath('0.discount', 0)
            ->assertJsonPath('0.final_price', 300_000);
    }
}
