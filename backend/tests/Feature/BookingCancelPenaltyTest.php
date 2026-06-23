<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BookingCancelPenaltyTest extends TestCase
{
    use RefreshDatabase;

    private function makeBooking(array $overrides = []): Booking
    {
        $customer = User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
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

    /** Khách huỷ khi chưa có tài xế nhận — không phạt dù đã lâu */
    public function test_no_penalty_when_no_driver_accepted_yet(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking(['created_at' => now()->subHours(3)]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->pending_penalty);
    }

    /** Khách huỷ trong vòng 60 phút sau khi tài xế nhận — không phạt */
    public function test_no_penalty_when_cancelled_within_60_min_of_acceptance(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking([
            'status'      => 'finding_driver',
            'accepted_at' => now()->subMinutes(30),
        ]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->pending_penalty);
    }

    /** Khách huỷ sau 60 phút kể từ accepted_at — bị phạt 50,000đ */
    public function test_penalty_applied_when_cancelled_after_60_min_of_acceptance(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking([
            'status'      => 'finding_driver',
            'accepted_at' => now()->subMinutes(90),
        ]);
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(50_000, $customer->fresh()->pending_penalty);
    }

    /** formatBooking trả về accepted_at */
    public function test_booking_response_includes_accepted_at(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking(['accepted_at' => now()->subMinutes(10)]);
        $customer = $booking->customer;

        $response = $this->actingAs($customer, 'sanctum')
            ->getJson("/api/bookings/{$booking->id}")
            ->assertOk();

        $this->assertArrayHasKey('accepted_at', $response->json());
        $this->assertNotNull($response->json('accepted_at'));
    }
}
