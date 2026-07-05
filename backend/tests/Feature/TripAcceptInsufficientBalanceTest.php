<?php
// backend/tests/Feature/TripAcceptInsufficientBalanceTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TripAcceptInsufficientBalanceTest extends TestCase
{
    use RefreshDatabase;

    private function makeActiveDriver(int $points): array
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00001',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'status'        => 'active',
        ]);
        $wallet = Wallet::create(['user_id' => $driver->id, 'points' => $points]);

        return [$driver, $wallet];
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
            'price'        => 500_000, // phí app 20% = 100 điểm
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);
    }

    public function test_accept_rejected_when_wallet_balance_below_app_fee(): void
    {
        Notification::fake();
        [$driver, $wallet] = $this->makeActiveDriver(points: 50); // cần 100
        $booking = $this->makeFindingBooking();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422);

        // Booking không bị nhận, ví không đổi, không có giao dịch
        $this->assertEquals('finding_driver', $booking->fresh()->status);
        $this->assertNull($booking->fresh()->driver_id);
        $this->assertEquals(50, $wallet->fresh()->points);
        $this->assertDatabaseMissing('wallet_transactions', ['booking_id' => $booking->id]);
    }

    public function test_accept_succeeds_when_balance_exactly_equals_fee(): void
    {
        Notification::fake();
        [$driver, $wallet] = $this->makeActiveDriver(points: 100);
        $booking = $this->makeFindingBooking();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        $this->assertEquals('accepted', $booking->fresh()->status);
        $this->assertEquals(0, $wallet->fresh()->points);
        $this->assertDatabaseHas('wallet_transactions', [
            'booking_id' => $booking->id,
            'type'       => 'debit',
            'points'     => 100,
        ]);
    }

    public function test_accept_rejected_when_driver_has_no_wallet(): void
    {
        Notification::fake();
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00002',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Đen',
            'status'        => 'active',
        ]);
        // không tạo ví — accept sẽ firstOrCreate ví 0 điểm
        $booking = $this->makeFindingBooking();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422);

        $this->assertEquals('finding_driver', $booking->fresh()->status);
    }
}
