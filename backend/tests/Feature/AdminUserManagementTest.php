<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function admin(array $attrs = []): User
    {
        return User::factory()->create(array_merge(['role' => 'admin'], $attrs));
    }

    public function test_admin_can_list_admins_with_self_flag(): void
    {
        $me    = $this->admin(['name' => 'Tôi']);
        $other = $this->admin(['name' => 'Người khác']);
        $this->admin(['is_blocked' => true]);
        User::factory()->create(['role' => 'customer']);

        $response = $this->actingAs($me, 'sanctum')->getJson('/api/admin/admins')->assertOk();

        $this->assertCount(3, $response->json());
        $rows = collect($response->json())->keyBy('id');
        $this->assertTrue($rows[$me->id]['is_self']);
        $this->assertFalse($rows[$other->id]['is_self']);
    }

    public function test_admin_can_create_admin_with_hashed_password(): void
    {
        $me = $this->admin();

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/admins', [
                'name' => 'Admin Mới', 'phone' => '0977000111', 'password' => '654321',
            ])
            ->assertCreated();

        $created = User::where('phone', '0977000111')->where('role', 'admin')->first();
        $this->assertNotNull($created);
        $this->assertSame('Admin Mới', $created->name);
        // APP_ENV=testing bật dev-bypass mật khẩu trong login(), nên phải kiểm hash
        // trực tiếp trên DB thay vì gọi /auth/login rồi kỳ vọng 200.
        $this->assertTrue(Hash::check('654321', $created->password));
    }

    public function test_creating_admin_with_existing_admin_phone_fails(): void
    {
        $me = $this->admin();
        $this->admin(['phone' => '0977000111']);

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/admins', [
                'name' => 'Trùng', 'phone' => '0977000111', 'password' => '654321',
            ])
            ->assertStatus(422);
    }

    public function test_can_create_admin_with_phone_already_used_by_customer(): void
    {
        $me = $this->admin();
        User::factory()->create(['role' => 'customer', 'phone' => '0977000222']);

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/admins', [
                'name' => 'Kiêm nhiệm', 'phone' => '0977000222', 'password' => '654321',
            ])
            ->assertCreated();

        $this->assertSame(2, User::where('phone', '0977000222')->count());
    }

    public function test_creating_admin_requires_six_digit_password(): void
    {
        $me = $this->admin();

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/admins', [
                'name' => 'Yếu', 'phone' => '0977000333', 'password' => 'abcdef',
            ])
            ->assertStatus(422);
    }

    public function test_admin_can_rename_another_admin(): void
    {
        $me    = $this->admin();
        $other = $this->admin(['name' => 'Tên cũ']);

        $this->actingAs($me, 'sanctum')
            ->patchJson("/api/admin/admins/{$other->id}", ['name' => 'Tên mới'])
            ->assertOk();

        $this->assertSame('Tên mới', $other->fresh()->name);
    }

    public function test_cannot_target_a_non_admin_user(): void
    {
        $me       = $this->admin();
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($me, 'sanctum')
            ->patchJson("/api/admin/admins/{$customer->id}/block")
            ->assertStatus(422);

        $this->assertFalse((bool) $customer->fresh()->is_blocked);
    }

    public function test_admin_cannot_block_self(): void
    {
        $me = $this->admin();

        $this->actingAs($me, 'sanctum')
            ->patchJson("/api/admin/admins/{$me->id}/block")
            ->assertStatus(403);

        $this->assertFalse((bool) $me->fresh()->is_blocked);
    }

    public function test_blocking_admin_revokes_tokens_and_denies_login(): void
    {
        $me    = $this->admin();
        $other = $this->admin(['phone' => '0977000444', 'password' => Hash::make('654321')]);
        $other->createToken('api');

        $this->actingAs($me, 'sanctum')
            ->patchJson("/api/admin/admins/{$other->id}/block")
            ->assertOk();

        $this->assertTrue((bool) $other->fresh()->is_blocked);
        $this->assertSame(0, $other->tokens()->count());

        $this->postJson('/api/auth/login', [
            'phone' => '0977000444', 'password' => '654321', 'role' => 'admin',
        ])->assertStatus(403)->assertJson(['code' => 'blocked']);
    }

    public function test_unblocking_admin_restores_login(): void
    {
        $me    = $this->admin();
        $other = $this->admin([
            'phone' => '0977000555', 'password' => Hash::make('654321'), 'is_blocked' => true,
        ]);

        $this->actingAs($me, 'sanctum')
            ->patchJson("/api/admin/admins/{$other->id}/unblock")
            ->assertOk();

        $this->assertFalse((bool) $other->fresh()->is_blocked);

        $this->postJson('/api/auth/login', [
            'phone' => '0977000555', 'password' => '654321', 'role' => 'admin',
        ])->assertOk();
    }

    public function test_admin_can_reset_another_admin_password(): void
    {
        $me    = $this->admin();
        $other = $this->admin(['password' => Hash::make('111111')]);

        $this->actingAs($me, 'sanctum')
            ->postJson("/api/admin/admins/{$other->id}/password", ['password' => '654321'])
            ->assertOk();

        $this->assertTrue(Hash::check('654321', $other->fresh()->password));
    }

    public function test_admin_cannot_reset_own_password_via_reset_route(): void
    {
        $me = $this->admin(['password' => Hash::make('111111')]);

        $this->actingAs($me, 'sanctum')
            ->postJson("/api/admin/admins/{$me->id}/password", ['password' => '654321'])
            ->assertStatus(403);

        $this->assertTrue(Hash::check('111111', $me->fresh()->password));
    }

    public function test_admin_can_change_own_password(): void
    {
        $me = $this->admin(['password' => Hash::make('111111')]);

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/me/password', [
                'current_password' => '111111', 'password' => '654321',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('654321', $me->fresh()->password));
    }

    public function test_changing_own_password_with_wrong_current_password_fails(): void
    {
        $me = $this->admin(['password' => Hash::make('111111')]);

        $this->actingAs($me, 'sanctum')
            ->postJson('/api/admin/me/password', [
                'current_password' => '999999', 'password' => '654321',
            ])
            ->assertStatus(422);

        $this->assertTrue(Hash::check('111111', $me->fresh()->password));
    }

    public function test_customer_cannot_access_admin_user_routes(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/admin/admins')
            ->assertStatus(403);
    }
}
