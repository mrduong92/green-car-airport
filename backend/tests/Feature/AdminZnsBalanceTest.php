<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Zns\ZnsSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminZnsBalanceTest extends TestCase
{
    use RefreshDatabase;

    private function adminUser(): User
    {
        return User::create([
            'phone' => '0999000099',
            'role'  => 'admin',
            'name'  => 'Test Admin',
        ]);
    }

    private function customerUser(): User
    {
        return User::create([
            'phone' => '0999000098',
            'role'  => 'customer',
            'name'  => 'Test Customer',
        ]);
    }

    public function test_admin_can_get_balance(): void
    {
        $this->mock(ZnsSender::class)
            ->shouldReceive('getBalance')
            ->once()
            ->andReturn(547050);

        $this->actingAs($this->adminUser())
            ->getJson('/api/admin/zns/balance')
            ->assertOk()
            ->assertJson(['balance' => 547050]);
    }

    public function test_balance_is_null_when_provider_does_not_support_it(): void
    {
        $this->mock(ZnsSender::class)
            ->shouldReceive('getBalance')
            ->once()
            ->andReturn(null);

        $this->actingAs($this->adminUser())
            ->getJson('/api/admin/zns/balance')
            ->assertOk()
            ->assertJson(['balance' => null]);
    }

    public function test_customer_cannot_access_balance_endpoint(): void
    {
        $this->actingAs($this->customerUser())
            ->getJson('/api/admin/zns/balance')
            ->assertForbidden();
    }

    public function test_unauthenticated_cannot_access_balance_endpoint(): void
    {
        $this->getJson('/api/admin/zns/balance')
            ->assertUnauthorized();
    }
}
