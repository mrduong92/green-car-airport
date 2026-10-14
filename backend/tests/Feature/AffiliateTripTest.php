<?php

// backend/tests/Feature/AffiliateTripTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Notifications\RewardPointsEarnedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AffiliateTripTest extends TestCase
{
    use RefreshDatabase;

    private function driver(int $points = 1000): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        $d->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $d->id, 'points' => $points]);

        return $d;
    }

    private function booking(User $customer, int $pointsUsed): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 500_000, 'discount' => 50_000, 'surcharge' => 0, 'points_used' => $pointsUsed, 'status' => 'finding_driver',
        ]);
    }

    private function points(User $u, string $col = 'points'): int
    {
        return (int) Wallet::where('user_id', $u->id)->value($col);
    }

    private function complete(User $d, Booking $b)
    {
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'in_progress'])->assertOk();

        return $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'completed']);
    }

    public function test_accept_charges_fee_minus_points_and_driver_nets_80_percent(): void
    {
        $d = $this->driver(1000);
        $b = $this->booking(User::factory()->create(['role' => 'customer']), 45);

        $res = $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertSame(1000 - (90 - 45), $this->points($d));
        $this->assertSame(45, $b->fresh()->charged_fee_points);
        $this->assertSame(405_000, $res->json('final_price'));       // tiền mặt khách trả
        $this->assertSame(45_000, $res->json('app_fee'));            // phí thực trừ
        $this->assertSame(45, $res->json('points_used'));
        $this->assertSame(360_000, $res->json('net_earning'));       // 80% × 450k
        $this->assertSame(405_000 - 45_000, $res->json('net_earning')); // = tiền mặt − phí thực trừ
    }

    public function test_driver_cancel_keeps_customer_points_and_next_driver_pays_reduced_fee(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 0]);
        $b = $this->booking($c, 45);
        $d1 = $this->driver(1000);
        $d2 = $this->driver(1000);

        $this->actingAs($d1, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        // Route thật là PATCH /api/driver/trips/{id}/cancel (field reason) — xem routes/api.php.
        $this->actingAs($d1, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/cancel", ['reason' => 'Xe hỏng'])->assertOk();
        $this->actingAs($d2, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertSame(45, $b->fresh()->points_used);
        $this->assertNull($b->fresh()->points_refunded_at);
        $this->assertSame(0, $this->points($c, 'reward_points'));
        $this->assertSame(1000 - 45, $this->points($d2));
    }

    public function test_customer_cancel_accepted_booking_refunds_driver_fee_and_customer_points_once(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 1000]); // số dư SAU khi đã giữ 45 điểm lúc đặt
        $b = $this->booking($c, 45);
        $d = $this->driver(1000);

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->assertSame(1000 - (90 - 45), $this->points($d)); // phí trừ lúc nhận = appFee(90) − points_used(45) = 45

        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$b->id}/cancel")->assertOk();
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$b->id}/cancel")->assertStatus(422);

        $this->assertSame(1000, $this->points($d)); // tài xế được hoàn đúng charged_fee_points (45) đã trừ, một lần
        $this->assertSame(1045, $this->points($c, 'reward_points')); // khách được hoàn 45 điểm đã dùng, một lần
    }

    public function test_completion_credits_cashback_and_commission_and_notifies(): void
    {
        Notification::fake();
        $referrer = User::factory()->create(['role' => 'customer']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        $d = $this->driver(1000);
        $b = $this->booking($c, 0);
        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->complete($d, $b)->assertOk();

        $this->assertSame(22, $this->points($c, 'reward_points'));
        $this->assertSame(22, $this->points($referrer, 'reward_points'));
        Notification::assertSentTo($c, RewardPointsEarnedNotification::class);
        Notification::assertSentTo($referrer, RewardPointsEarnedNotification::class);
    }

    public function test_legacy_booking_without_charged_fee_completes_and_credits_once(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $d = $this->driver(1000);
        $b = $this->booking($c, 0);
        $b->update(['driver_id' => $d->id, 'status' => 'accepted', 'accepted_at' => now()]); // nhận trước bản trừ-lúc-nhận

        $this->complete($d, $b)->assertOk();
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/status", ['status' => 'completed'])->assertStatus(422);

        $this->assertSame(22, $this->points($c, 'reward_points'));
    }
}
