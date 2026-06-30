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
}
