<?php

// backend/tests/Feature/CustomerRewardApiTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class CustomerRewardApiTest extends TestCase
{
    use RefreshDatabase;

    private function completed(User $c, int $price, string $at, int $commission = 0): Booking
    {
        $b = Booking::create([
            'customer_id' => $c->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01', 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => $price, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed', 'cashback_points' => 0, 'commission_points' => $commission,
        ]);
        Booking::whereKey($b->id)->update(['updated_at' => $at, 'created_at' => $at]);

        return $b;
    }

    public function test_reward_wallet_and_transactions(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $w = Wallet::create(['user_id' => $c->id, 'points' => 500, 'reward_points' => 0]);
        $w->creditReward(22, 'cashback', 'Hoàn điểm cuốc #1');
        $w->credit(400, 'Thu hộ'); // điểm thường — không được hiện ở ví thưởng

        $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet')
            ->assertOk()->assertJson(['reward_points' => 22, 'max_rate_percent' => 10, 'cashback_percent' => 5, 'commission_percent' => 5]);

        $tx = $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet/transactions')->assertOk()->json('data');
        $this->assertCount(1, $tx);
        $this->assertSame('cashback', $tx[0]['kind']);
    }

    public function test_reward_wallet_for_customer_without_wallet(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->actingAs($c, 'sanctum')->getJson('/api/customer/reward-wallet')->assertOk()->assertJson(['reward_points' => 0]);
    }

    public function test_referrals_list_masks_phone_and_filters_by_month(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $f1 = User::factory()->create(['role' => 'customer', 'phone' => '0912345678', 'name' => 'Lan', 'referred_by_user_id' => $me->id]);
        User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $me->id]);
        User::factory()->create(['role' => 'customer']); // không phải F1
        $this->completed($f1, 500_000, '2026-09-10 10:00:00', 25);
        $this->completed($f1, 300_000, '2026-10-05 10:00:00', 15);

        $all = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals')->assertOk();
        $all->assertJson(['total_f1' => 2]);
        $lan = collect($all->json('items'))->firstWhere('name', 'Lan');
        $this->assertSame('0912***678', $lan['phone_masked']);
        $this->assertSame(2, $lan['trips']);
        $this->assertSame(800_000, $lan['spent']);
        $this->assertSame(40, $lan['commission_points']);
        $this->assertCount(12, $all->json('monthly'));

        $oct = collect($this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-10')->json('items'))->firstWhere('name', 'Lan');
        $this->assertSame(1, $oct['trips']);
        $this->assertSame(300_000, $oct['spent']);
        $this->assertSame(15, $oct['commission_points']);

        $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-13')->assertStatus(422);
    }

    public function test_collaborator_wallet_ignores_reward_transactions(): void
    {
        $ctv = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $w = Wallet::create(['user_id' => $ctv->id, 'points' => 0]);
        $b = Booking::create([
            'customer_id' => $ctv->id, 'collaborator_id' => $ctv->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01',
            'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0,
            'collection_fee' => 100_000, 'status' => 'completed',
        ]);
        $w->credit(100, "Thu hộ cuốc #{$b->id}", $b->id);
        $w->creditReward(25, 'cashback', "Hoàn điểm cuốc #{$b->id}", $b->id);

        $this->actingAs($ctv, 'sanctum')->getJson('/api/customer/collaborator/wallet')->assertOk()->assertJson(['points' => 100, 'total_earned' => 100]);
        $this->assertCount(1, $this->actingAs($ctv, 'sanctum')->getJson('/api/customer/collaborator/wallet/transactions')->json());
    }

    public function test_referrals_month_filter_does_not_overflow_on_long_current_day(): void
    {
        // "now" là ngày 31 — Carbon::createFromFormat('Y-m', ...) không reset ngày/giờ,
        // nên tháng 2 (28/29 ngày) có thể tràn sang tháng 3 nếu không dùng modifier '!'.
        $this->travelTo(Carbon::parse('2026-10-31 10:00:00'));

        $me = User::factory()->create(['role' => 'customer']);
        $f1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $me->id]);
        $this->completed($f1, 200_000, '2026-09-15 10:00:00', 10);
        $this->completed($f1, 300_000, '2026-10-05 10:00:00', 15);

        $sep = collect(
            $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-09')->assertOk()->json('items')
        )->firstWhere('id', $f1->id);

        $this->assertSame(1, $sep['trips']);
        $this->assertSame(200_000, $sep['spent']);
        $this->assertSame(10, $sep['commission_points']);
    }
}
