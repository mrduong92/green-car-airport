<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoucherApplyCapTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function voucher(string $type, int $value): Voucher
    {
        return Voucher::create([
            'code'        => 'TEST' . $value,
            'type'        => $type,
            'value'       => $value,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);
    }

    public function test_fixed_voucher_larger_than_10pct_is_capped(): void
    {
        // 100k voucher on 250k ride → max = 25k, so discount = 25k
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('fixed', 100_000)->code,
                'price' => 250_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 25_000,
                'max_discount' => 25_000,
            ]);
    }

    public function test_fixed_voucher_below_10pct_is_not_capped(): void
    {
        // 10k voucher on 250k ride → max = 25k, so discount = 10k (not capped)
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('fixed', 10_000)->code,
                'price' => 250_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 10_000,
                'max_discount' => 25_000,
            ]);
    }

    public function test_percent_voucher_larger_than_10pct_is_capped(): void
    {
        // 50% voucher on 500k ride → raw = 250k, max = 50k, so discount = 50k
        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/customer/vouchers/apply', [
                'code'  => $this->voucher('percent', 50)->code,
                'price' => 500_000,
            ])
            ->assertOk()
            ->assertJson([
                'discount'     => 50_000,
                'max_discount' => 50_000,
            ]);
    }
}
