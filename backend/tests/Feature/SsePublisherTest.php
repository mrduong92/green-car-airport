<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

class SsePublisherTest extends TestCase
{
    use RefreshDatabase;

    private function makeCustomer(): User
    {
        return User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
    }

    private function makeDriver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);
        $driver->driverProfile()->create(['vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00001', 'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'status' => 'active']);
        return $driver;
    }

    private function makeBooking(User $customer, array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ], $overrides));
    }

    public function test_booking_store_publishes_new_booking_to_correct_channel(): void
    {
        Notification::fake();

        $publishedChannel = null;
        $publishedPayload = null;

        Redis::shouldReceive('publish')
            ->once()
            ->withArgs(function ($channel, $payload) use (&$publishedChannel, &$publishedPayload) {
                $publishedChannel = $channel;
                $publishedPayload = $payload;
                return true;
            })
            ->andReturn(1);

        $customer = $this->makeCustomer();

        $this->actingAs($customer)->postJson('/api/bookings', [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
        ])->assertStatus(201);

        $this->assertEquals('driver.trips.events', $publishedChannel);
        $data = json_decode($publishedPayload, true);
        $this->assertEquals('new_booking', $data['type']);
        $this->assertIsInt($data['booking_id']);
    }

    public function test_booking_cancel_publishes_cancelled_to_correct_channel(): void
    {
        Notification::fake();

        $customer = $this->makeCustomer();
        $booking  = $this->makeBooking($customer);

        $publishedChannel = null;
        $publishedPayload = null;

        Redis::shouldReceive('publish')
            ->once()
            ->withArgs(function ($channel, $payload) use (&$publishedChannel, &$publishedPayload) {
                $publishedChannel = $channel;
                $publishedPayload = $payload;
                return true;
            })
            ->andReturn(1);

        $this->actingAs($customer)
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals('driver.trips.events', $publishedChannel);
        $data = json_decode($publishedPayload, true);
        $this->assertEquals('booking_cancelled', $data['type']);
        $this->assertEquals($booking->id, $data['booking_id']);
    }

    public function test_trip_accept_publishes_trip_taken_to_correct_channel(): void
    {
        Notification::fake();

        $customer = $this->makeCustomer();
        $driver   = $this->makeDriver();
        $booking  = $this->makeBooking($customer);

        $publishedChannel = null;
        $publishedPayload = null;

        Redis::shouldReceive('publish')
            ->once()
            ->withArgs(function ($channel, $payload) use (&$publishedChannel, &$publishedPayload) {
                $publishedChannel = $channel;
                $publishedPayload = $payload;
                return true;
            })
            ->andReturn(1);

        $this->actingAs($driver)
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        $this->assertEquals('driver.trips.events', $publishedChannel);
        $data = json_decode($publishedPayload, true);
        $this->assertEquals('trip_taken', $data['type']);
        $this->assertEquals($booking->id, $data['booking_id']);
    }
}
