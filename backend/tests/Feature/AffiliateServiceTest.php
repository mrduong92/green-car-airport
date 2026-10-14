<?php

// backend/tests/Feature/AffiliateServiceTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AffiliateService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AffiliateServiceTest extends TestCase
{
    use RefreshDatabase;

    private function svc(): AffiliateService
    {
        return app(AffiliateService::class);
    }

    private function booking(User $customer, array $over = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'surcharge' => 0, 'status' => 'finding_driver',
        ], $over));
    }

    private function reward(User $u): int
    {
        return (int) Wallet::where('user_id', $u->id)->value('reward_points');
    }

    public function test_reward_points_round_down(): void
    {
        $this->assertSame(22, AffiliateService::rewardPoints(450_000, 5));
        $this->assertSame(0, AffiliateService::rewardPoints(19_999, 5));
        $this->assertSame(0, AffiliateService::rewardPoints(-1000, 5));
    }

    public function test_spendable_is_min_of_balance_and_cap(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 100]);
        $this->assertSame(45, $this->svc()->spendable($c, 450_000));   // trần 10% × 450k = 45 điểm
        Wallet::where('user_id', $c->id)->update(['reward_points' => 7]);
        $this->assertSame(7, $this->svc()->spendable($c, 450_000));
        $other = User::factory()->create(['role' => 'customer']);       // chưa có ví
        $this->assertSame(0, $this->svc()->spendable($other, 450_000));
    }

    public function test_hold_uses_current_balance_and_never_goes_negative(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 30]);
        $b = $this->booking($c);

        $held = DB::transaction(fn () => $this->svc()->hold($b));

        $this->assertSame(30, $held);
        $this->assertSame(30, $b->fresh()->points_used);
        $this->assertSame(0, $this->reward($c));
        $this->assertDatabaseHas('wallet_transactions', ['booking_id' => $b->id, 'balance' => 'reward', 'kind' => 'spend', 'points' => 30]);
    }

    public function test_refund_once_only(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 30]);
        $b = $this->booking($c);
        DB::transaction(fn () => $this->svc()->hold($b));

        $this->assertSame(30, DB::transaction(fn () => $this->svc()->refund($b->fresh(), 'khách huỷ')));
        $this->assertSame(0, DB::transaction(fn () => $this->svc()->refund($b->fresh(), 'khách huỷ')));
        $this->assertSame(0, DB::transaction(fn () => $this->svc()->refund($b, 'khách huỷ'))); // bản cũ trong bộ nhớ
        $this->assertSame(30, $this->reward($c));
    }

    public function test_settle_credits_customer_and_customer_referrer_once(): void
    {
        $referrer = User::factory()->create(['role' => 'customer']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        $b = $this->booking($c, ['status' => 'completed']);

        $res = DB::transaction(fn () => $this->svc()->settle($b));
        $again = DB::transaction(fn () => $this->svc()->settle($b->fresh()));

        $this->assertSame(['cashback' => 22, 'commission' => 22, 'referrer_id' => $referrer->id], $res);
        $this->assertSame(['cashback' => 0, 'commission' => 0, 'referrer_id' => null], $again);
        $this->assertSame(22, $this->reward($c));
        $this->assertSame(22, $this->reward($referrer));
        $this->assertSame(22, $b->fresh()->cashback_points);
        $this->assertSame(22, $b->fresh()->commission_points);
    }

    public function test_driver_referrer_gets_no_commission(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $c = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id]);
        $b = $this->booking($c, ['status' => 'completed']);

        $res = DB::transaction(fn () => $this->svc()->settle($b));

        $this->assertSame(22, $res['cashback']);
        $this->assertSame(0, $res['commission']);
        $this->assertNull($res['referrer_id']);
        $this->assertSame(0, $this->reward($driver));
        $this->assertSame(0, $b->fresh()->commission_points);
    }

    public function test_settle_uses_current_percentages(): void
    {
        AppSetting::set(AppSetting::AFFILIATE_CASHBACK_PERCENT, '2');
        $c = User::factory()->create(['role' => 'customer']);
        $b = $this->booking($c, ['status' => 'completed']);

        $this->assertSame(9, DB::transaction(fn () => $this->svc()->settle($b))['cashback']); // 2% × 450k = 9
    }
}
