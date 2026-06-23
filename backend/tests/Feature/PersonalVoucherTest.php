<?php
// backend/tests/Feature/PersonalVoucherTest.php
namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PersonalVoucherTest extends TestCase
{
    use RefreshDatabase;

    private function makePersonalVoucher(int $userId, string $code): Voucher
    {
        return Voucher::create([
            'code' => $code, 'type' => 'fixed', 'value' => 50000,
            'target' => 'specific', 'expires_at' => now()->addMonth(),
            'usage_limit' => 1, 'usage_count' => 0, 'is_active' => true,
            'user_id' => $userId,
        ]);
    }

    private function makePublicVoucher(string $code): Voucher
    {
        return Voucher::create([
            'code' => $code, 'type' => 'fixed', 'value' => 30000,
            'target' => 'all', 'expires_at' => now()->addMonth(),
            'is_active' => true,
        ]);
    }

    public function test_my_vouchers_returns_only_own_personal_vouchers(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $other    = User::factory()->create(['role' => 'customer']);

        $this->makePersonalVoucher($customer->id, 'REF-OWN');
        $this->makePersonalVoucher($other->id, 'REF-OTHER');

        $response = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/my-vouchers')
            ->assertOk();

        $this->assertCount(1, $response->json());
        $this->assertEquals('REF-OWN', $response->json()[0]['code']);
    }

    public function test_public_vouchers_endpoint_excludes_personal_vouchers(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->makePublicVoucher('PUBLIC50');
        $this->makePersonalVoucher($customer->id, 'REF-PERSONAL');

        $response = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/vouchers')
            ->assertOk();

        $codes = collect($response->json())->pluck('code');
        $this->assertTrue($codes->contains('PUBLIC50'));
        $this->assertFalse($codes->contains('REF-PERSONAL'));
    }

    public function test_apply_personal_voucher_succeeds_for_owner(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->makePersonalVoucher($customer->id, 'REF-MINE');

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => 'REF-MINE', 'price' => 500000])
            ->assertOk();
    }

    public function test_apply_personal_voucher_rejected_for_non_owner(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $this->makePersonalVoucher($owner->id, 'REF-NOT-MINE');

        $this->actingAs($other, 'sanctum')
            ->postJson('/api/customer/vouchers/apply', ['code' => 'REF-NOT-MINE', 'price' => 500000])
            ->assertStatus(422);
    }
}
