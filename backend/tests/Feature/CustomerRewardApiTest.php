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
        Booking::whereKey($b->id)->update(['completed_at' => $at, 'created_at' => $at]);

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

    /** Cùng lý do với AdminReferralReportTest — tháng hoàn thành bám completed_at, không phải updated_at. */
    public function test_referrals_month_attribution_survives_later_update_bumping_updated_at(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $f1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $me->id]);
        $this->completed($f1, 300_000, '2026-09-10 09:00:00', 15);

        $this->travelTo(Carbon::parse('2026-10-20 10:00:00'));
        Booking::where('customer_id', $f1->id)->update(['note' => null]);

        $sep = collect($this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-09')->json('items'))->firstWhere('id', $f1->id);
        $oct = collect($this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-10')->json('items'))->firstWhere('id', $f1->id);

        $this->assertSame(1, $sep['trips']);
        $this->assertSame(300_000, $sep['spent']);
        $this->assertSame(0, $oct['trips']);
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

    private function f1(User $me, string $createdAt, array $attrs = []): User
    {
        $u = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $me->id] + $attrs);
        User::whereKey($u->id)->update(['created_at' => $createdAt]);

        return $u;
    }

    public function test_referrals_range_buckets_are_zero_filled_and_summarised(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $a = $this->f1($me, '2026-10-02 09:00:00', ['name' => 'An']);
        $this->f1($me, '2026-09-20 09:00:00'); // đăng ký trước khoảng lọc
        $this->completed($a, 500_000, '2026-10-03 10:00:00', 25);
        $this->completed($a, 300_000, '2026-10-03 18:00:00', 15);
        $this->completed($a, 200_000, '2026-09-30 10:00:00', 10); // ngoài khoảng

        $res = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?from=2026-10-01&to=2026-10-05&group=day')->assertOk();
        $res->assertJson([
            'from' => '2026-10-01', 'to' => '2026-10-05', 'group' => 'day',
            'summary' => ['total_f1' => 2, 'new_f1' => 1, 'f1_trips' => 2, 'f1_revenue' => 800_000, 'commission_points' => 40],
        ]);
        $series = collect($res->json('series'));
        $this->assertCount(5, $series);
        $this->assertSame(['key' => '2026-10-03', 'label' => '03/10', 'new_f1' => 0, 'f1_revenue' => 800_000, 'commission_points' => 40], $series[2]);
        $this->assertSame(1, $series[1]['new_f1']);
        $this->assertSame(0, $series[4]['f1_revenue']);

        // items: mọi F1 (kể cả không có chuyến trong khoảng), số liệu theo khoảng.
        $items = collect($res->json('items'));
        $this->assertCount(2, $items);
        $an = $items->firstWhere('name', 'An');
        $this->assertSame(2, $an['trips']);
        $this->assertSame(800_000, $an['spent']);
        $this->assertSame(40, $an['commission_points']);

        $week = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?from=2026-10-01&to=2026-10-11&group=week')->assertOk()->json('series');
        $this->assertSame(['2026-09-28', '2026-10-05'], array_column($week, 'key'));
    }

    public function test_referrals_range_boundaries_are_inclusive(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $f = $this->f1($me, '2026-10-01 00:00:00');
        $this->completed($f, 100_000, '2026-10-01 00:00:00', 5);
        $this->completed($f, 100_000, '2026-10-05 23:59:59', 5);
        $this->completed($f, 100_000, '2026-10-06 00:00:00', 5);
        $this->completed($f, 100_000, '2026-09-30 23:59:59', 5);

        $s = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?from=2026-10-01&to=2026-10-05')->assertOk()->json('summary');
        $this->assertSame(2, $s['f1_trips']);
        $this->assertSame(1, $s['new_f1']);
    }

    public function test_referrals_range_validation(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $get = fn (string $q) => $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?'.$q);

        $get('from=2026-10-05&to=2026-10-01')->assertStatus(422);
        $get('from=2025-01-01&to=2026-10-01')->assertStatus(422);
        $get('from=2026-10-01&to=2026-10-05&group=year')->assertStatus(422);
        $get('from=10/01/2026')->assertStatus(422);
    }

    public function test_referrals_default_range_is_current_month_with_series(): void
    {
        $this->travelTo(Carbon::parse('2026-10-18 10:00:00'));
        $me = User::factory()->create(['role' => 'customer']);
        $f = $this->f1($me, '2026-10-10 10:00:00');
        $this->completed($f, 100_000, '2026-10-12 10:00:00', 5);
        $this->completed($f, 100_000, '2026-09-12 10:00:00', 5);

        $res = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals')->assertOk();
        $res->assertJson(['from' => '2026-10-01', 'to' => '2026-10-18', 'group' => 'day', 'summary' => ['f1_trips' => 1, 'new_f1' => 1]]);
        $this->assertCount(18, $res->json('series'));
    }

    public function test_referrals_only_count_my_customer_f1(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver']);
        $mine = $this->f1($me, '2026-10-02 10:00:00');
        $theirs = $this->f1($other, '2026-10-02 10:00:00');
        $viaDriver = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id]);
        User::whereKey($viaDriver->id)->update(['created_at' => '2026-10-02 10:00:00']);
        $this->completed($mine, 100_000, '2026-10-03 10:00:00', 5);
        $this->completed($theirs, 900_000, '2026-10-03 10:00:00', 45);
        $this->completed($viaDriver, 700_000, '2026-10-03 10:00:00', 35);

        $res = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?from=2026-10-01&to=2026-10-05')->assertOk();
        $res->assertJson(['summary' => ['total_f1' => 1, 'new_f1' => 1, 'f1_trips' => 1, 'f1_revenue' => 100_000, 'commission_points' => 5]]);
        $this->assertSame([$mine->id], array_column($res->json('items'), 'id'));
    }

    public function test_referrals_legacy_month_param_keeps_legacy_keys_and_maps_to_whole_month(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $f = $this->f1($me, '2026-09-10 10:00:00');
        $this->completed($f, 100_000, '2026-09-30 23:00:00', 5);
        $this->completed($f, 100_000, '2026-10-01 00:00:00', 5);

        $res = $this->actingAs($me, 'sanctum')->getJson('/api/customer/referrals?month=2026-09')->assertOk();
        $res->assertJson(['from' => '2026-09-01', 'to' => '2026-09-30', 'group' => 'day', 'total_f1' => 1, 'summary' => ['f1_trips' => 1, 'new_f1' => 1]]);
        $this->assertArrayHasKey('f1_this_month', $res->json());
        $this->assertCount(12, $res->json('monthly'));
        $this->assertCount(30, $res->json('series'));
        $this->assertSame(1, $res->json('items.0.trips'));
    }
}
