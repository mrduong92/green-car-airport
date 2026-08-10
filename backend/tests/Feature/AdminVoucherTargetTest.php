<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Hồi quy cho lỗ hổng: AdminVoucherController::store() nhận `target` nhưng không
 * nhận `user_id`, nên voucher admin tưởng cấp riêng cho một khách (target=specific)
 * thực ra có user_id=NULL → lọt vào danh sách công khai, ai cũng áp được.
 * Xem docs/superpowers/specs/2026-08-10-campaign-voucher-design.md — Phần 1.
 */
class AdminVoucherTargetTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'code'        => 'TESTCODE1',
            'type'        => 'fixed',
            'value'       => 50000,
            'target'      => 'all',
            'expires_at'  => now()->addMonth()->format('Y-m-d'),
            'usage_limit' => 100,
        ], $overrides);
    }

    public function test_target_specific_without_user_id_returns_422(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers', $this->payload(['target' => 'specific']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_id']);

        $this->assertDatabaseMissing('vouchers', ['code' => 'TESTCODE1']);
    }

    public function test_target_all_with_user_id_returns_422(): void
    {
        $customer = $this->customer();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers', $this->payload(['target' => 'all', 'user_id' => $customer->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_target_specific_with_valid_user_id_creates_voucher(): void
    {
        $customer = $this->customer();

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers', $this->payload(['target' => 'specific', 'user_id' => $customer->id]))
            ->assertCreated();

        $response->assertJsonPath('user_id', $customer->id)
            ->assertJsonPath('user.phone', $customer->phone);

        $this->assertDatabaseHas('vouchers', ['code' => 'TESTCODE1', 'target' => 'specific', 'user_id' => $customer->id]);
    }

    public function test_specific_voucher_does_not_appear_in_public_list(): void
    {
        $owner = $this->customer();
        $other = $this->customer();

        Voucher::create([
            'code' => 'PRIV50K', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific',
            'user_id' => $owner->id, 'expires_at' => now()->addMonth(), 'usage_limit' => 1,
            'usage_count' => 0, 'is_active' => true,
        ]);

        $codes = $this->actingAs($other, 'sanctum')
            ->getJson('/api/customer/vouchers')
            ->assertOk()
            ->json();

        $this->assertFalse(collect($codes)->pluck('code')->contains('PRIV50K'));
    }

    public function test_other_customer_cannot_apply_specific_voucher(): void
    {
        $owner = $this->customer();
        $other = $this->customer();

        $voucher = Voucher::create([
            'code' => 'PRIV50K', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific',
            'user_id' => $owner->id, 'expires_at' => now()->addMonth(), 'usage_limit' => 1,
            'usage_count' => 0, 'is_active' => true,
        ]);

        $this->actingAs($other, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => $voucher->code, 'price' => 200000])
            ->assertStatus(422);
    }

    public function test_owner_can_apply_own_specific_voucher(): void
    {
        $owner = $this->customer();

        $voucher = Voucher::create([
            'code' => 'PRIV50K', 'type' => 'fixed', 'value' => 50000, 'target' => 'specific',
            'user_id' => $owner->id, 'expires_at' => now()->addMonth(), 'usage_limit' => 1,
            'usage_count' => 0, 'is_active' => true,
        ]);

        $this->actingAs($owner, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => $voucher->code, 'price' => 200000])
            ->assertOk();
    }
}
