<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class CustomerCancelAcceptedBookingTest extends TestCase
{
    use RefreshDatabase;

    private function setupAcceptedBooking(array $overrides = []): array
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
        $driver   = User::factory()->create(['role' => 'driver']);
        $wallet   = Wallet::create(['user_id' => $driver->id, 'points' => 0]);

        $booking = Booking::create(array_merge([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'accepted',
            'accepted_at'  => now()->subMinutes(30),
        ], $overrides));

        // Simulate fee already deducted at accept time
        $feePoints = (int) round(300_000 * 0.20 / 1000);
        $wallet->decrement('points', $feePoints);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => $booking->id,
            'type'        => 'debit',
            'description' => "Phí app 20% cuốc #{$booking->id}",
            'points'      => $feePoints,
        ]);

        return compact('customer', 'driver', 'booking', 'wallet');
    }

    /** Khách có thể huỷ khi status = accepted (trong 60 phút) */
    public function test_customer_can_cancel_accepted_booking_within_60_min(): void
    {
        ['customer' => $customer, 'booking' => $booking] = $this->setupAcceptedBooking();

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk()
            ->assertJsonPath('status', 'cancelled');
    }

    /** Huỷ accepted → hoàn phí app 20% cho tài xế */
    public function test_cancel_accepted_refunds_driver_app_fee(): void
    {
        ['customer' => $customer, 'booking' => $booking, 'wallet' => $wallet] = $this->setupAcceptedBooking();

        $pointsBefore = $wallet->fresh()->points;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $feePoints = (int) round(300_000 * 0.20 / 1000); // 60 points
        $this->assertEquals($pointsBefore + $feePoints, $wallet->fresh()->points);

        $this->assertDatabaseHas('wallet_transactions', [
            'wallet_id'  => $wallet->id,
            'booking_id' => $booking->id,
            'type'       => 'credit',
        ]);
    }

    /** Không thể huỷ khi status = in_progress */
    public function test_cannot_cancel_in_progress_booking(): void
    {
        ['customer' => $customer, 'booking' => $booking] = $this->setupAcceptedBooking([
            'status' => 'in_progress',
        ]);

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertStatus(422);
    }

    /** Huỷ sau 60 phút → phạt khách + vẫn hoàn phí cho tài xế */
    public function test_cancel_after_60_min_penalizes_customer_and_still_refunds_driver(): void
    {
        ['customer' => $customer, 'booking' => $booking, 'wallet' => $wallet] = $this->setupAcceptedBooking([
            'accepted_at' => now()->subMinutes(90),
        ]);

        $pointsBefore = $wallet->fresh()->points;

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        $this->assertEquals(50_000, $customer->fresh()->pending_penalty);

        $feePoints = (int) round(300_000 * 0.20 / 1000);
        $this->assertEquals($pointsBefore + $feePoints, $wallet->fresh()->points);
    }

    /** Hoàn phí app khi huỷ phải bao gồm collection_fee */
    public function test_cancel_accepted_refunds_driver_fee_including_collection_fee(): void
    {
        Notification::fake();
        $customer = User::factory()->create(['role' => 'customer']);
        $driver   = User::factory()->create(['role' => 'driver']);
        $wallet   = Wallet::create(['user_id' => $driver->id, 'points' => 500]);

        $booking = Booking::create([
            'customer_id'    => $customer->id,
            'driver_id'      => $driver->id,
            'pickup'         => 'Hà Nội',
            'destination'    => 'Nội Bài',
            'date'           => now()->addDay()->format('Y-m-d'),
            'time'           => '08:00',
            'vehicle_type'   => 'sedan_4',
            'distance_km'    => 30,
            'status'         => 'accepted',
            'accepted_at'    => now(),
            'price'          => 300_000,
            'discount'       => 0,
            'collection_fee' => 50_000,
            'surcharge'      => 0,
        ]);

        $this->actingAs($customer, 'sanctum')->patchJson("/api/bookings/{$booking->id}/cancel")
            ->assertOk();

        // Fee charged at accept = 20% of (300k + 50k) = 70k = 70 points
        // Refund must also be 70 points
        $this->assertEquals(500 + 70, $wallet->fresh()->points);
    }
}
