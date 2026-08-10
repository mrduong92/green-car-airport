<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /api/admin/vouchers/bulk — cấp voucher cá nhân cho N khách trong 1 lượt.
 * Khác store(): mỗi khách nhận 1 voucher riêng (mã tự sinh qua VoucherIssuer),
 * không phải 1 voucher chung 1 mã cho nhiều người (mã voucher là unique).
 */
class AdminVoucherBulkGrantTest extends TestCase
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
            'type'        => 'fixed',
            'value'       => 30000,
            'expires_at'  => now()->addMonth()->format('Y-m-d'),
        ], $overrides);
    }

    public function test_grants_one_voucher_per_customer(): void
    {
        $customers = User::factory()->count(3)->create(['role' => 'customer']);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload([
                'user_ids' => $customers->pluck('id')->all(),
            ]))
            ->assertCreated();

        $this->assertCount(3, $response->json());

        foreach ($customers as $customer) {
            $this->assertDatabaseHas('vouchers', [
                'target' => 'specific', 'user_id' => $customer->id, 'value' => 30000,
            ]);
        }
    }

    public function test_each_voucher_gets_a_distinct_code(): void
    {
        $customers = User::factory()->count(3)->create(['role' => 'customer']);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload([
                'user_ids' => $customers->pluck('id')->all(),
            ]))
            ->assertCreated();

        $codes = Voucher::whereIn('user_id', $customers->pluck('id'))->pluck('code');
        $this->assertCount(3, $codes->unique());
    }

    public function test_defaults_usage_limit_to_1(): void
    {
        $customer = $this->customer();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload(['user_ids' => [$customer->id]]))
            ->assertCreated();

        $this->assertDatabaseHas('vouchers', ['user_id' => $customer->id, 'usage_limit' => 1]);
    }

    public function test_custom_usage_limit_is_respected(): void
    {
        $customer = $this->customer();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload(['user_ids' => [$customer->id], 'usage_limit' => 5]))
            ->assertCreated();

        $this->assertDatabaseHas('vouchers', ['user_id' => $customer->id, 'usage_limit' => 5]);
    }

    public function test_rejects_empty_user_ids(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload(['user_ids' => []]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);
    }

    public function test_rejects_nonexistent_user_id(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload(['user_ids' => [999999]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids.0']);
    }

    public function test_granted_voucher_only_usable_by_its_owner(): void
    {
        $owner = $this->customer();
        $other = $this->customer();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/admin/vouchers/bulk', $this->payload(['user_ids' => [$owner->id]]))
            ->assertCreated();

        $voucher = Voucher::where('user_id', $owner->id)->first();

        $this->actingAs($other, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => $voucher->code, 'price' => 200000])
            ->assertStatus(422);

        $this->actingAs($owner, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => $voucher->code, 'price' => 200000])
            ->assertOk();
    }
}
