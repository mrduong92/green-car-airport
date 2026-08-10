<?php
// backend/tests/Feature/VipColumnTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\PriceConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VipColumnTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $plain = Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
        $this->assertFalse($plain->fresh()->is_vip);

        $vip = Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '09:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
            'is_vip' => true,
        ]);
        $this->assertTrue($vip->fresh()->is_vip);
    }

    public function test_driver_profile_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $profile = DriverProfile::create([
            'user_id' => $driver->id,
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-12345',
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);
        $this->assertFalse($profile->fresh()->is_vip);

        $profile->update(['is_vip' => true]);
        $this->assertTrue($profile->fresh()->is_vip);
    }

    public function test_price_config_is_vip_defaults_to_false_and_is_fillable(): void
    {
        $config = PriceConfig::create([
            'service_type' => 'airport',
            'trip_type' => 'one_way',
            'vehicle_type' => 'sedan_4',
            'price_type' => 'range',
            'min_price' => 200_000,
            'max_price' => 300_000,
        ]);
        $this->assertFalse($config->fresh()->is_vip);

        $vipConfig = PriceConfig::create([
            'service_type' => 'airport',
            'trip_type' => 'one_way',
            'vehicle_type' => 'sedan_4',
            'price_type' => 'range',
            'min_price' => 350_000,
            'max_price' => 500_000,
            'is_vip' => true,
        ]);
        $this->assertTrue($vipConfig->fresh()->is_vip);
    }
}
