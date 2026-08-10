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

    private function publicVoucher(array $overrides = []): array
    {
        return array_merge([
            'code' => 'PUB' . uniqid(), 'type' => 'fixed', 'value' => 50000, 'target' => 'all',
            'expires_at' => now()->addMonth(), 'usage_limit' => 100, 'usage_count' => 0, 'is_active' => true,
        ], $overrides);
    }

    public function test_store_always_creates_public_voucher_even_if_target_sent(): void
    {
        $customer = $this->customer();

        // store() không còn nhận target/user_id — gửi kèm cũng bị bỏ qua lặng lẽ
        // (Laravel validate() chỉ trả field có trong rule list), voucher vẫn target=all.
        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers', [
                'code' => 'TESTCODE1', 'type' => 'fixed', 'value' => 50000,
                'target' => 'specific', 'user_id' => $customer->id,
                'expires_at' => now()->addMonth()->format('Y-m-d'), 'usage_limit' => 100,
            ])
            ->assertCreated();

        $response->assertJsonPath('target', 'all')->assertJsonPath('user_id', null);
        $this->assertDatabaseHas('vouchers', ['code' => 'TESTCODE1', 'target' => 'all', 'user_id' => null]);
    }

    public function test_update_can_assign_existing_public_voucher_to_a_customer(): void
    {
        $customer = $this->customer();
        $voucher  = Voucher::create($this->publicVoucher());

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/vouchers/{$voucher->id}", [
                'target' => 'specific', 'user_id' => $customer->id,
            ])
            ->assertOk();

        $response->assertJsonPath('target', 'specific')
            ->assertJsonPath('user_id', $customer->id)
            ->assertJsonPath('user.phone', $customer->phone);

        $this->assertDatabaseHas('vouchers', [
            'id' => $voucher->id, 'target' => 'specific', 'user_id' => $customer->id,
        ]);
    }

    public function test_update_target_specific_without_user_id_returns_422(): void
    {
        $voucher = Voucher::create($this->publicVoucher());

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/vouchers/{$voucher->id}", ['target' => 'specific'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_update_target_all_with_user_id_returns_422(): void
    {
        $customer = $this->customer();
        $voucher  = Voucher::create($this->publicVoucher());

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/vouchers/{$voucher->id}", ['target' => 'all', 'user_id' => $customer->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_update_keeps_existing_user_id_when_only_value_changes(): void
    {
        $customer = $this->customer();
        $voucher  = Voucher::create(array_merge($this->publicVoucher(), [
            'target' => 'specific', 'user_id' => $customer->id,
        ]));

        // Không gửi target/user_id — phải giữ nguyên target=specific hiện tại, không
        // bị validate chéo từ chối (đây là ca dùng "chỉ đổi mệnh giá").
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/vouchers/{$voucher->id}", ['value' => 70000])
            ->assertOk()
            ->assertJsonPath('value', 70000)
            ->assertJsonPath('user_id', $customer->id);
    }

    public function test_update_can_unassign_back_to_public(): void
    {
        $customer = $this->customer();
        $voucher  = Voucher::create(array_merge($this->publicVoucher(), [
            'target' => 'specific', 'user_id' => $customer->id,
        ]));

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/admin/vouchers/{$voucher->id}", ['target' => 'all', 'user_id' => null])
            ->assertOk()
            ->assertJsonPath('target', 'all')
            ->assertJsonPath('user_id', null);
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
