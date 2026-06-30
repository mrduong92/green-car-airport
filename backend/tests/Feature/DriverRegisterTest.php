<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverRegisterTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'phone'         => '0911111111',
            'otp'           => '000000',
            'password'      => '123456',
            'name'          => 'Nguyễn Tài Xế',
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-11111',
            'vehicle_year'  => 2022,
            'vehicle_color' => 'Trắng',
            'vehicle_type'  => 'sedan_4',
        ], $overrides);
    }

    public function test_driver_register_creates_user_with_driver_role(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertCreated()
            ->assertJsonPath('user.role', 'driver')
            ->assertJsonStructure(['token', 'user']);

        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
    }

    public function test_driver_register_creates_driver_profile_with_vehicle_type(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => '51G-11111',
            'vehicle_type'  => 'sedan_4',
            'is_verified'   => 1,
        ]);
    }

    public function test_driver_register_creates_wallet(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertCreated();

        $user = User::where('phone', '0911111111')->first();
        $this->assertDatabaseHas('wallets', ['user_id' => $user->id, 'points' => 0]);
    }

    public function test_driver_register_needs_onboarding_is_false(): void
    {
        $response = $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertCreated();

        $this->assertFalse($response->json('user.needs_onboarding'));
    }

    public function test_driver_register_rejects_duplicate_phone(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())->assertCreated();

        $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('message', 'Số điện thoại đã được đăng ký.');
    }

    public function test_driver_register_rejects_invalid_vehicle_type(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload(['vehicle_type' => 'bike']))
            ->assertStatus(422);
    }

    public function test_driver_register_requires_vehicle_plate(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload(['vehicle_plate' => '']))
            ->assertStatus(422);
    }
}
