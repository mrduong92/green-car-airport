<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CollaboratorFeeTest extends TestCase
{
    use RefreshDatabase;

    private function makeBookingWithCollectionFee(): array
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $driver       = User::factory()->create(['role' => 'driver']);
        // Driver cần ví với đủ điểm để trừ phí
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);
        // Driver phải có driverProfile với status = active để được nhận cuốc
        $driver->driverProfile()->create(['vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00001', 'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'status' => 'active']);

        $booking = Booking::create([
            'customer_id'    => $collaborator->id,
            'collaborator_id'=> $collaborator->id,
            'pickup'         => 'Khách sạn A',
            'destination'    => 'Sân bay Nội Bài',
            'date'           => now()->addDay()->format('Y-m-d'),
            'time'           => '08:00',
            'vehicle_type'   => 'sedan_4',
            'distance_km'    => 30,
            'price'          => 1_000_000,
            'discount'       => 0,
            'surcharge'      => 0,
            'collection_fee' => 200_000,
            'status'         => 'finding_driver',
        ]);

        return [$collaborator, $driver, $booking];
    }

    /** Driver thấy final_price = total_collected (bao gồm thu hộ) */
    public function test_trip_list_shows_total_collected_as_final_price(): void
    {
        [$collaborator, $driver, $booking] = $this->makeBookingWithCollectionFee();

        $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonPath('0.final_price', 1_200_000)  // 1_000_000 + 200_000
            ->assertJsonPath('0.app_fee', 240_000);        // 1_200_000 * 20%
    }

    /** Phí app khi accept = 20% của total_collected */
    public function test_accept_deducts_fee_on_total_collected(): void
    {
        [$collaborator, $driver, $booking] = $this->makeBookingWithCollectionFee();

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        // feePoints = round(1_200_000 * 0.20 / 1000) = 240
        $wallet = Wallet::where('user_id', $driver->id)->first();
        $this->assertEquals(10_000 - 240, $wallet->points);
    }

    /** Collaborator nhận 80% × collection_fee khi trip completed */
    public function test_collaborator_receives_80_percent_on_completion(): void
    {
        [$collaborator, $driver, $booking] = $this->makeBookingWithCollectionFee();

        // Accept
        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        // Complete
        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'in_progress'])
            ->assertOk();
        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        // collaborator_net = floor(200_000 * 0.80 / 1000) = 160 điểm
        $collabWallet = Wallet::where('user_id', $collaborator->id)->first();
        $this->assertNotNull($collabWallet);
        $this->assertEquals(160, $collabWallet->points);

        $tx = WalletTransaction::where('wallet_id', $collabWallet->id)->first();
        $this->assertNotNull($tx);
        $this->assertEquals('credit', $tx->type);
        $this->assertEquals(160, $tx->points);
        $this->assertStringContainsString("Thu hộ cuốc #{$booking->id}", $tx->description);
    }

    /** Cuốc không có thu hộ không ảnh hưởng logic hiện tại */
    public function test_no_collection_fee_uses_existing_logic(): void
    {
        $driver   = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);
        $driver->driverProfile()->create(['vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-00002', 'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'status' => 'active']);

        $booking = Booking::create([
            'customer_id'    => $customer->id,
            'pickup'         => 'Hà Nội',
            'destination'    => 'Sân bay',
            'date'           => now()->addDay()->format('Y-m-d'),
            'time'           => '08:00',
            'vehicle_type'   => 'sedan_4',
            'distance_km'    => 20,
            'price'          => 500_000,
            'discount'       => 0,
            'surcharge'      => 0,
            'collection_fee' => 0,
            'status'         => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        // feePoints = round(500_000 * 0.20 / 1000) = 100
        $wallet = Wallet::where('user_id', $driver->id)->first();
        $this->assertEquals(10_000 - 100, $wallet->points);
    }
}
