<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Thu hộ + phí phạt huỷ được TẠM GIỮ (trừ ví) ngay lúc tài xế nhận cuốc.
 *
 * Trước đây hai khoản này trừ lúc hoàn thành: ví không đủ thì lệnh trừ vượt
 * cột UNSIGNED và nổ SQL, nhưng booking đã kịp chuyển `completed` → CTV không
 * được cộng, tài xế không bị trừ, im lặng (sự cố cuốc #513 trên production).
 */
class CollectionFeeHoldTest extends TestCase
{
    use RefreshDatabase;

    private function driver(int $points): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Innova', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2022, 'vehicle_color' => 'Bạc', 'vehicle_type' => 'mpv_7', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => $points]);

        return $driver;
    }

    /** Giống cuốc #513: giá 1,9tr, thu hộ 400k → phí 380 + thu hộ 400 = 780 điểm. */
    private function booking(array $overrides = []): Booking
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);

        return Booking::create(array_merge([
            'customer_id' => $collaborator->id,
            'collaborator_id' => $collaborator->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 1_900_000,
            'discount' => 0,
            'surcharge' => 0,
            'collection_fee' => 400_000,
            'status' => 'finding_driver',
        ], $overrides));
    }

    private function points(User $u): int
    {
        return (int) Wallet::where('user_id', $u->id)->value('points');
    }

    private function complete(User $driver, Booking $booking)
    {
        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'in_progress'])->assertOk();

        return $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed']);
    }

    public function test_accept_rejected_when_wallet_covers_fee_but_not_collection(): void
    {
        $driver = $this->driver(730); // đúng số dư của tài xế 318 lúc nhận cuốc #513
        $booking = $this->booking();

        $res = $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertStatus(422);

        $this->assertStringContainsString('780', $res->json('message'));
        $this->assertStringContainsString('730', $res->json('message'));
        $this->assertSame('finding_driver', $booking->fresh()->status);
        $this->assertSame(730, $this->points($driver));
        $this->assertDatabaseMissing('wallet_transactions', ['booking_id' => $booking->id]);
    }

    public function test_trip_list_shows_points_needed_to_accept(): void
    {
        $driver = $this->driver(0);
        $booking = $this->booking(['surcharge' => 50_000]);

        $trip = collect($this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')->assertOk()->json())
            ->firstWhere('id', $booking->id);

        $this->assertSame(380 + 400 + 50, $trip['required_points']);
    }

    public function test_accept_holds_fee_and_collection_together(): void
    {
        $driver = $this->driver(800);
        $booking = $this->booking();

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        $this->assertSame(20, $this->points($driver)); // 800 - 380 - 400
        $this->assertSame(400, $booking->fresh()->held_points);
        $this->assertDatabaseHas('wallet_transactions', [
            'booking_id' => $booking->id, 'type' => 'debit', 'points' => 400,
            'description' => "Thu hộ cuốc #{$booking->id}",
        ]);
    }

    public function test_accept_holds_cancel_penalty_too(): void
    {
        $driver = $this->driver(1_000);
        $booking = $this->booking(['surcharge' => 50_000]);

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        $this->assertSame(1_000 - 380 - 400 - 50, $this->points($driver));
        $this->assertSame(450, $booking->fresh()->held_points);
        $this->assertDatabaseHas('wallet_transactions', [
            'booking_id' => $booking->id, 'type' => 'debit', 'points' => 50,
            'description' => "Phí phạt huỷ khách cuốc #{$booking->id}",
        ]);
    }

    public function test_complete_credits_collaborator_without_touching_driver_wallet_again(): void
    {
        $driver = $this->driver(780);
        $booking = $this->booking();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();
        $this->assertSame(0, $this->points($driver));

        // Ví về 0 vẫn hoàn thành được — khoản thu hộ đã giữ từ lúc nhận.
        $this->complete($driver, $booking)->assertOk();

        $this->assertSame('completed', $booking->fresh()->status);
        $this->assertSame(0, $this->points($driver));
        $this->assertSame(400, $this->points($booking->collaborator));
        $this->assertSame(1, WalletTransaction::where('booking_id', $booking->id)
            ->where('description', "Thu hộ cuốc #{$booking->id}")->where('type', 'debit')->count());
        $this->assertSame(1, (int) $driver->driverProfile->fresh()->trips_count);
    }

    public function test_driver_cancel_refunds_held_amount_but_not_app_fee(): void
    {
        $driver = $this->driver(1_000);
        $booking = $this->booking(['surcharge' => 50_000]);
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        $this->actingAs($driver, 'sanctum')->patchJson("/api/driver/trips/{$booking->id}/cancel")->assertOk();

        $this->assertSame(1_000 - 380, $this->points($driver)); // phí app không hoàn khi tài xế huỷ
        $this->assertSame(0, $booking->fresh()->held_points);
        $this->assertSame('finding_driver', $booking->fresh()->status);
    }

    public function test_customer_cancel_refunds_held_amount_and_app_fee(): void
    {
        $driver = $this->driver(1_000);
        $booking = $this->booking();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        $this->actingAs($booking->customer, 'sanctum')->patchJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertSame(1_000, $this->points($driver));
        $this->assertSame(0, $booking->fresh()->held_points);
    }

    public function test_booking_without_collaborator_holds_nothing_for_collection(): void
    {
        $driver = $this->driver(380);
        $booking = $this->booking(['collaborator_id' => null]);

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        $this->assertSame(0, $this->points($driver));
        $this->assertSame(0, $booking->fresh()->held_points);
    }

    /** Cuốc nhận TRƯỚC khi deploy (chưa giữ gì) mà ví không đủ: chặn hoàn thành, không để nửa vời. */
    public function test_legacy_trip_with_insufficient_wallet_cannot_complete_half_way(): void
    {
        $driver = $this->driver(0);
        $booking = $this->booking(['driver_id' => $driver->id, 'status' => 'in_progress', 'accepted_at' => now()]);

        $res = $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertStatus(422);

        $this->assertStringContainsString('400', $res->json('message'));
        $this->assertSame('in_progress', $booking->fresh()->status);
        $this->assertSame(0, $this->points($booking->collaborator));
        $this->assertSame(0, (int) $driver->driverProfile->fresh()->trips_count);
    }

    public function test_legacy_trip_with_enough_wallet_still_debits_at_completion(): void
    {
        $driver = $this->driver(500);
        $booking = $this->booking(['driver_id' => $driver->id, 'status' => 'in_progress', 'accepted_at' => now()]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertSame(100, $this->points($driver));
        $this->assertSame(400, $this->points($booking->collaborator));
    }
}
