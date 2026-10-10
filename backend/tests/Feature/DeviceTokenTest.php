<?php
// backend/tests/Feature/DeviceTokenTest.php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_push_dang_cu_van_dang_ky_duoc(): void
    {
        $user = User::factory()->create(['role' => 'driver']);

        $this->actingAs($user, 'sanctum')->postJson('/api/device-token', [
            'subscription' => ['endpoint' => 'https://push.example/abc', 'keys' => ['p256dh' => 'p', 'auth' => 'a']],
        ])->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'user_id' => $user->id, 'endpoint' => 'https://push.example/abc', 'platform' => 'web', 'fcm_token' => null,
        ]);
    }

    public function test_dang_ky_fcm_token(): void
    {
        $user = User::factory()->create(['role' => 'driver']);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'fcm-1', 'platform' => 'android'])
            ->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'user_id' => $user->id, 'fcm_token' => 'fcm-1', 'platform' => 'android', 'endpoint' => null,
        ]);
    }

    public function test_cung_token_user_khac_dang_ky_thi_chuyen_chu(): void
    {
        $a = User::factory()->create(['role' => 'driver']);
        $b = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $a->id, 'fcm_token' => 'fcm-shared', 'platform' => 'android']);

        $this->actingAs($b, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'fcm-shared', 'platform' => 'android'])
            ->assertOk();

        $this->assertSame(1, DeviceToken::where('fcm_token', 'fcm-shared')->count());
        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 'fcm-shared', 'user_id' => $b->id]);
    }

    public function test_thieu_ca_hai_dang_thi_422(): void
    {
        $user = User::factory()->create(['role' => 'customer']);

        $this->actingAs($user, 'sanctum')->postJson('/api/device-token', [])->assertStatus(422);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'x', 'platform' => 'web'])
            ->assertStatus(422);
    }

    public function test_xoa_theo_fcm_token_chi_xoa_cua_minh(): void
    {
        $a = User::factory()->create(['role' => 'driver']);
        $b = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $a->id, 'fcm_token' => 'fcm-a', 'platform' => 'android']);

        $this->actingAs($b, 'sanctum')
            ->deleteJson('/api/device-token', ['fcm_token' => 'fcm-a'])
            ->assertOk();
        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 'fcm-a']);

        $this->actingAs($a, 'sanctum')
            ->deleteJson('/api/device-token', ['fcm_token' => 'fcm-a'])
            ->assertOk();
        $this->assertDatabaseMissing('device_tokens', ['fcm_token' => 'fcm-a']);
    }

    public function test_xoa_theo_endpoint_van_chay(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/x', 'p256dh' => 'p', 'auth' => 'a']);

        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/device-token', ['endpoint' => 'https://push.example/x'])
            ->assertOk();

        $this->assertDatabaseMissing('device_tokens', ['endpoint' => 'https://push.example/x']);
    }
}
