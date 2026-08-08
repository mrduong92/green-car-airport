<?php

// backend/tests/Feature/RealtimeBroadcastTest.php
//
// Trước đây là SsePublisherTest, kiểm `Redis::publish` thủ công của bản SSE.
// Nay realtime đi qua Reverb nên kiểm broadcast event thay thế.

namespace Tests\Feature;

use App\Events\CustomerBookingUpdated;
use App\Events\DriverTripsUpdated;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class RealtimeBroadcastTest extends TestCase
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
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ], $overrides));
    }

    public function test_booking_store_broadcasts_new_booking_to_drivers(): void
    {
        Notification::fake();
        Event::fake([DriverTripsUpdated::class]);

        $customer = $this->makeCustomer();

        $this->actingAs($customer)->postJson('/api/bookings', [
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
        ])->assertSuccessful();

        Event::assertDispatched(
            DriverTripsUpdated::class,
            fn (DriverTripsUpdated $e) => $e->type === 'new_booking'
        );
    }

    public function test_booking_cancel_broadcasts_to_drivers(): void
    {
        Notification::fake();
        Event::fake([DriverTripsUpdated::class]);

        $customer = $this->makeCustomer();
        $booking = $this->makeBooking($customer);

        $this->actingAs($customer)
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        Event::assertDispatched(
            DriverTripsUpdated::class,
            fn (DriverTripsUpdated $e) => $e->type === 'booking_cancelled' && $e->bookingId === $booking->id
        );
    }

    /**
     * accept() phát HAI sự kiện trên HAI kênh khác nhau — bản test cũ dùng
     * `Redis::shouldReceive('publish')->once()` nên luôn đỏ vì thực tế publish
     * 2 lần. Đây chính là test fail-sẵn tồn tại trong repo.
     */
    public function test_trip_accept_broadcasts_to_both_drivers_and_the_customer(): void
    {
        Notification::fake();
        Event::fake([DriverTripsUpdated::class, CustomerBookingUpdated::class]);

        $customer = $this->makeCustomer();
        $driver = $this->makeDriver();
        $booking = $this->makeBooking($customer);

        $this->actingAs($driver)
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        // Tài xế khác phải thấy cuốc biến mất khỏi sàn
        Event::assertDispatched(
            DriverTripsUpdated::class,
            fn (DriverTripsUpdated $e) => $e->type === 'trip_taken' && $e->bookingId === $booking->id
        );

        // Khách phải được báo đã có tài xế nhận
        Event::assertDispatched(
            CustomerBookingUpdated::class,
            fn (CustomerBookingUpdated $e) => $e->type === 'booking_accepted'
                && $e->bookingId === $booking->id
                && $e->customerId === $customer->id
        );
    }

    public function test_customer_event_targets_private_channel_of_that_customer_only(): void
    {
        $customer = $this->makeCustomer();
        $event = new CustomerBookingUpdated($customer->id, 'booking_accepted', 123);

        // Rò kênh là lộ trạng thái chuyến của khách này sang khách khác
        $this->assertEquals('private-customer.'.$customer->id, $event->broadcastOn()->name);
        $this->assertEquals('booking.updated', $event->broadcastAs());
        $this->assertEquals(
            ['type' => 'booking_accepted', 'booking_id' => 123],
            $event->broadcastWith()
        );
    }

    public function test_driver_event_uses_private_channel(): void
    {
        $event = new DriverTripsUpdated('new_booking', 7);

        // KHÔNG được là public: bản SSE trước đây chặn role !== driver, để public
        // là khách hàng cũng nghe được toàn bộ cuốc phát sinh trong hệ thống.
        $this->assertEquals('private-driver.trips', $event->broadcastOn()->name);
        $this->assertEquals('trips.updated', $event->broadcastAs());
        $this->assertEquals(['type' => 'new_booking', 'booking_id' => 7], $event->broadcastWith());
    }
}
