<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReferralRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_stores_referred_by_when_valid_referral_code(): void
    {
        $referrer = User::factory()->create(['role' => 'customer']);

        $this->postJson('/api/auth/otp/send', ['phone' => '0987654321']);

        $this->postJson('/api/auth/register', [
            'phone'         => '0987654321',
            'otp'           => '000000',
            'password'      => '123456',
            'referral_code' => $referrer->referral_code,
        ])->assertOk();

        $newUser = User::where('phone', '0987654321')->first();
        $this->assertEquals($referrer->id, $newUser->referred_by_user_id);
    }

    public function test_register_ignores_invalid_referral_code(): void
    {
        $this->postJson('/api/auth/otp/send', ['phone' => '0987654322']);

        $this->postJson('/api/auth/register', [
            'phone'         => '0987654322',
            'otp'           => '000000',
            'password'      => '123456',
            'referral_code' => 'SGO-ZZZZZZ',
        ])->assertOk();

        $newUser = User::where('phone', '0987654322')->first();
        $this->assertNull($newUser->referred_by_user_id);
    }

    public function test_register_without_referral_code_succeeds(): void
    {
        $this->postJson('/api/auth/otp/send', ['phone' => '0987654323']);

        $this->postJson('/api/auth/register', [
            'phone'    => '0987654323',
            'otp'      => '000000',
            'password' => '123456',
        ])->assertOk();

        $newUser = User::where('phone', '0987654323')->first();
        $this->assertNull($newUser->referred_by_user_id);
    }

    public function test_me_returns_referral_code(): void
    {
        $user  = User::factory()->create(['role' => 'customer']);
        $token = $user->createToken('api')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me')->assertOk();

        $this->assertArrayHasKey('referral_code', $response->json());
        $this->assertEquals($user->referral_code, $response->json('referral_code'));
    }
}
