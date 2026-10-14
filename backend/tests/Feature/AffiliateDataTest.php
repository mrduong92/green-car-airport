<?php

// backend/tests/Feature/AffiliateDataTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AffiliateDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_reward_balance_is_separate_from_points(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $wallet = Wallet::create(['user_id' => $user->id, 'points' => 100]);

        $wallet->creditReward(30, 'cashback', 'Hoàn 5% cuốc #1');
        $wallet->debitReward(10, 'spend', 'Dùng điểm cuốc #2');

        $wallet->refresh();
        $this->assertSame(100, $wallet->points);
        $this->assertSame(20, $wallet->reward_points);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'type' => 'credit', 'balance' => 'reward', 'kind' => 'cashback', 'points' => 30]);
        $this->assertDatabaseHas('wallet_transactions', ['wallet_id' => $wallet->id, 'type' => 'debit', 'balance' => 'reward', 'kind' => 'spend', 'points' => 10]);

        $wallet->credit(5, 'Thu hộ');
        $this->assertSame('points', WalletTransaction::latest('id')->first()->balance);
    }

    public function test_booking_price_helpers(): void
    {
        $b = new Booking(['price' => 500_000, 'discount' => 50_000, 'surcharge' => 50_000, 'collection_fee' => 100_000]);
        $b->points_used = 45;

        $this->assertSame(450_000, $b->basePrice());
        $this->assertSame(45_000, $b->pointsDiscountVnd());
        $this->assertSame(500_000 - 50_000 - 45_000 + 50_000 + 100_000, $b->finalPrice());
        $this->assertSame(90 - 45, $b->driverFeePoints(0.2));
    }

    public function test_affiliate_settings_have_defaults_and_are_editable(): void
    {
        $this->assertSame(5.0, AppSetting::cashbackPercent());
        $this->assertSame(5.0, AppSetting::commissionPercent());
        $this->assertSame(10.0, AppSetting::pointsMaxRatePercent());

        $admin = User::factory()->create(['role' => 'admin']);
        $this->actingAs($admin, 'sanctum')->putJson('/api/admin/settings', [
            'contact_hotline' => '1900', 'contact_email' => 'a@b.vn', 'contact_zalo_phone' => '0900000000',
            'affiliate_cashback_percent' => 3, 'affiliate_commission_percent' => 4, 'points_max_rate_percent' => 8,
        ])->assertOk()->assertJson([
            'affiliate_cashback_percent' => 3, 'affiliate_commission_percent' => 4, 'points_max_rate_percent' => 8,
        ]);

        $this->assertSame(3.0, AppSetting::cashbackPercent());
    }
}
