<?php
// backend/tests/Feature/CollaboratorWalletTest.php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CollaboratorWalletTest extends TestCase
{
    use RefreshDatabase;

    public function test_collaborator_can_view_wallet(): void
    {
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        $wallet = Wallet::create(['user_id' => $collaborator->id, 'points' => 500]);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'credit',
            'description' => 'Thu hộ cuốc #1',
            'points'      => 500,
        ]);

        $this->actingAs($collaborator, 'sanctum')
            ->getJson('/api/customer/collaborator/wallet')
            ->assertOk()
            ->assertJsonPath('points', 500)
            ->assertJsonPath('total_earned', 500);
    }

    public function test_non_collaborator_gets_403_on_wallet(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/collaborator/wallet')
            ->assertForbidden();
    }

    public function test_admin_can_toggle_collaborator(): void
    {
        $admin    = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/customers/{$customer->id}/collaborator")
            ->assertOk()
            ->assertJsonPath('is_collaborator', true);

        $this->assertTrue($customer->fresh()->is_collaborator);

        // Toggle again — back to false
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/customers/{$customer->id}/collaborator")
            ->assertOk()
            ->assertJsonPath('is_collaborator', false);
    }

    public function test_admin_can_deduct_collaborator_points(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 500]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", [
                'points' => 200,
                'reason' => 'Đã thanh toán offline',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 300);

        $this->assertEquals(300, Wallet::where('user_id', $collaborator->id)->value('points'));
        $this->assertDatabaseHas('wallet_transactions', [
            'type'        => 'debit',
            'points'      => 200,
            'description' => 'Admin trừ điểm: Đã thanh toán offline',
        ]);
    }

    public function test_admin_cannot_deduct_more_than_balance(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 100]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", [
                'points' => 200,
                'reason' => 'Sai sót',
            ])
            ->assertStatus(422);

        $this->assertEquals(100, Wallet::where('user_id', $collaborator->id)->value('points'));
    }

    public function test_deduct_points_requires_reason(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 100]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/deduct-points", ['points' => 10])
            ->assertStatus(422);
    }

    public function test_admin_cannot_deduct_points_for_non_collaborator(): void
    {
        $admin    = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$customer->id}/deduct-points", [
                'points' => 10,
                'reason' => 'Test',
            ])
            ->assertStatus(422);
    }

    public function test_admin_can_reset_collaborator_points_to_zero(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 750]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/reset-points", [
                'reason' => 'Vi phạm chính sách',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 0);

        $this->assertEquals(0, Wallet::where('user_id', $collaborator->id)->value('points'));
        $this->assertDatabaseHas('wallet_transactions', [
            'type'        => 'debit',
            'points'      => 750,
            'description' => 'Admin xóa toàn bộ điểm: Vi phạm chính sách',
        ]);
    }

    public function test_admin_reset_with_zero_balance_is_noop(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 0]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/customers/{$collaborator->id}/reset-points", [
                'reason' => 'Không cần thiết',
            ])
            ->assertOk()
            ->assertJsonPath('new_balance', 0);

        $this->assertDatabaseMissing('wallet_transactions', [
            'description' => 'Admin xóa toàn bộ điểm: Không cần thiết',
        ]);
    }

    public function test_customer_index_shows_points_for_collaborator_and_null_otherwise(): void
    {
        $admin        = User::factory()->create(['role' => 'admin']);
        $collaborator = User::factory()->create(['role' => 'customer', 'is_collaborator' => true]);
        Wallet::create(['user_id' => $collaborator->id, 'points' => 320]);
        $plainCustomer = User::factory()->create(['role' => 'customer', 'is_collaborator' => false]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/customers')
            ->assertOk();

        $data = collect($response->json());
        $this->assertEquals(320, $data->firstWhere('id', $collaborator->id)['points']);
        $this->assertNull($data->firstWhere('id', $plainCustomer->id)['points']);
    }
}
