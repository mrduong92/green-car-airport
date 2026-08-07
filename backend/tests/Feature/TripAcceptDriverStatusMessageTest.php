<?php
// backend/tests/Feature/TripAcceptDriverStatusMessageTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TripAcceptDriverStatusMessageTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(string $status): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00003',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'status'        => $status,
        ]);

        return $driver;
    }

    private function makeFindingBooking(): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 500_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);
    }

    public function test_accept_rejects_pending_driver_with_pending_message(): void
    {
        $driver  = $this->makeDriver('pending');
        $booking = $this->makeFindingBooking();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(403)
            ->assertJson(['message' => 'Tài khoản chưa được phê duyệt.']);
    }

    public function test_accept_rejects_blocked_driver_with_blocked_message(): void
    {
        $driver  = $this->makeDriver('blocked');
        $booking = $this->makeFindingBooking();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(403)
            ->assertJson(['message' => 'Tài khoản đã bị khoá bởi admin.']);
    }
}
