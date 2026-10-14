<?php

// backend/tests/Feature/AffiliateTripTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
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

    /** Base 500k, không voucher, points_used = đúng trần 10% (50 điểm) — dùng cho test shortfall. */
    private function maxPointsBooking(User $customer): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 500_000, 'discount' => 0, 'surcharge' => 0, 'points_used' => 50, 'status' => 'finding_driver',
        ]);
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

    public function test_completing_trip_sets_completed_at(): void
    {
        $d = $this->driver(1000);
        $b = $this->booking(User::factory()->create(['role' => 'customer']), 0);
        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertNull($b->fresh()->completed_at);

        $this->complete($d, $b)->assertOk();

        $this->assertNotNull($b->fresh()->completed_at);
        $this->assertTrue($b->fresh()->completed_at->greaterThanOrEqualTo(now()->subSeconds(5)));
    }

    public function test_driver_sees_no_points_after_customer_cancels_accepted_points_booking(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 1000]);
        $b = $this->booking($c, 45);
        $d = $this->driver(1000);

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$b->id}/cancel")->assertOk();

        $trip = $this->actingAs($d, 'sanctum')->getJson("/api/driver/trips/{$b->id}")->assertOk();

        $this->assertSame(0, $trip->json('points_used'));
        $this->assertSame(0, $trip->json('points_discount'));
        // final_price như chưa từng dùng điểm: basePrice(450.000) + surcharge(0) + collection_fee(0)
        $this->assertSame(450_000, $trip->json('final_price'));
        // app_fee đầy đủ 20% × 450.000 = 90.000, không bị trừ phần điểm (đã hoàn)
        $this->assertSame(90_000, $trip->json('app_fee'));
        $this->assertSame(90, $trip->json('required_points'));

        $history = $this->actingAs($d, 'sanctum')->getJson('/api/driver/trips/history')->assertOk();
        $historyTrip = collect($history->json())->firstWhere('id', $b->id);
        $this->assertSame(0, $historyTrip['points_used']);
    }

    /**
     * CR #4: phí hạ xuống dưới trần dùng điểm SAU khi khách đã giữ điểm theo trần cũ —
     * driverFeePoints() clamp phí về 0, nhưng tài xế vẫn phải nhận đủ 95% giá cơ sở
     * (base 500k, phí 5%) — phần vượt (25 điểm) phải được APP BÙ thẳng vào ví.
     */
    public function test_accept_credits_shortfall_when_fee_rate_drops_below_points_used(): void
    {
        $d = $this->driver(1000);
        $c = User::factory()->create(['role' => 'customer']);
        $b = $this->maxPointsBooking($c);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5'); // admin hạ phí sau khi khách đã giữ điểm theo trần 10% cũ

        $res = $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();

        $this->assertSame(0, $b->fresh()->charged_fee_points);  // appFeePoints(25) - points(50) clamp về 0
        $this->assertSame(25, $b->fresh()->held_shortfall_points); // phần vượt: 50 - 25
        $this->assertSame(1000 + 25, $this->points($d)); // net change: -0 (phí) + 25 (bù)
        $this->assertSame(450_000, $res->json('final_price')); // tiền mặt khách trả = 500k - 50k điểm
        // tiền mặt (450k) + điểm bù quy đổi (25k) = 475k = 95% × 500k giá cơ sở
        $this->assertSame(475_000, $res->json('final_price') + 25 * 1000);
        $this->assertDatabaseHas('wallet_transactions', [
            'booking_id' => $b->id, 'type' => 'credit', 'points' => 25,
            'description' => "App bù phần điểm khách dùng vượt phí cuốc #{$b->id}",
        ]);
    }

    public function test_customer_cancel_restores_driver_wallet_exactly_after_shortfall_credit(): void
    {
        $d = $this->driver(1000);
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 1000]);
        $b = $this->maxPointsBooking($c);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5');

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->assertSame(1025, $this->points($d));

        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$b->id}/cancel")->assertOk();

        $this->assertSame(1000, $this->points($d)); // về ĐÚNG số dư trước khi nhận, không dư/thiếu
        $this->assertNull($b->fresh()->charged_fee_points);
        $this->assertSame(0, $b->fresh()->held_shortfall_points);
    }

    public function test_driver_cancel_reverses_shortfall_credit_so_next_driver_is_not_paid_twice(): void
    {
        $d1 = $this->driver(1000);
        $d2 = $this->driver(1000);
        $c = User::factory()->create(['role' => 'customer']);
        $b = $this->maxPointsBooking($c);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5');

        $this->actingAs($d1, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->assertSame(1025, $this->points($d1));

        $this->actingAs($d1, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/cancel", ['reason' => 'Bận'])->assertOk();
        // Bỏ cuốc: không được giữ phần app đã bù — cuốc chưa chạy xong.
        $this->assertSame(1000, $this->points($d1));
        $this->assertSame(0, $b->fresh()->held_shortfall_points);

        $this->actingAs($d2, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        // Tài xế 2 được bù đúng MỘT lần — không cộng dồn với lần đã thu lại của tài xế 1.
        $this->assertSame(1025, $this->points($d2));
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
