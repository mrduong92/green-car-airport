<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class BookingCancelReasonTest extends TestCase
{
    use RefreshDatabase;

    private function makeBooking(): Booking
    {
        $customer = User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
        return Booking::create([
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
        ]);
    }

    public function test_cancel_reason_is_saved(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel", [
                'cancel_reason' => 'Tài xế yêu cầu hủy',
            ])
            ->assertOk();

        $this->assertEquals('Tài xế yêu cầu hủy', $booking->fresh()->cancel_reason);
    }

    public function test_cancel_without_reason_is_allowed(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertNull($booking->fresh()->cancel_reason);
    }

    public function test_cancel_reason_too_long_is_rejected(): void
    {
        Notification::fake();
        $booking  = $this->makeBooking();
        $customer = $booking->customer;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel", [
                'cancel_reason' => str_repeat('a', 256),
            ])
            ->assertStatus(422);
    }
}
