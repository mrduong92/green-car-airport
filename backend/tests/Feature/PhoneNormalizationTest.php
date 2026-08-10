<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PhoneNormalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_phone_recognizes_account_registered_with_leading_zero(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/check-phone', ['phone' => '901234599'])
            ->assertOk()
            ->assertJson(['exists' => true, 'roles' => ['customer']]);
    }

    public function test_login_with_missing_leading_zero_finds_account_stored_with_it(): void
    {
        User::create([
            'phone'    => '0901234599',
            'role'     => 'customer',
            'password' => bcrypt('000000'),
        ]);

        $this->postJson('/api/auth/login', [
            'phone'    => '901234599',
            'password' => '000000',
        ])
            ->assertOk()
            ->assertJsonPath('user.phone', '0901234599');
    }

    public function test_register_stores_phone_in_normalized_format(): void
    {
        $this->postJson('/api/auth/register', [
            'phone'    => '901234599',
            'otp'      => '000000',
            'password' => '111111',
            'name'     => 'Test User',
        ])->assertOk();

        $this->assertDatabaseHas('users', ['phone' => '0901234599', 'role' => 'customer']);
        $this->assertDatabaseMissing('users', ['phone' => '901234599']);
    }

    public function test_register_rejects_duplicate_phone_in_different_format(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/register', [
            'phone'    => '901234599',
            'otp'      => '000000',
            'password' => '111111',
            'name'     => 'Test User',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Số điện thoại đã được đăng ký.']);
    }

    public function test_register_driver_stores_phone_in_normalized_format(): void
    {
        $this->postJson('/api/auth/register/driver', [
            'phone'                     => '84901234599',
            'otp'                       => '000000',
            'password'                  => '111111',
            'name'                      => 'Driver Test',
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Vios',
            'vehicle_plate'             => '51G-99999',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'cccd_number'               => '079123456789',
            'gplx_number'               => 'GPLX999999',
            'vehicle_reg_number'        => 'REG999999',
            'vehicle_inspection_number' => 'INSP999999',
            'vehicle_inspection_expiry' => now()->addYear()->toDateString(),
            'insurance_number'          => 'INS999999',
            'insurance_expiry'          => now()->addYear()->toDateString(),
        ])->assertCreated();

        $this->assertDatabaseHas('users', ['phone' => '0901234599', 'role' => 'driver']);
    }

    public function test_reset_password_finds_account_regardless_of_input_format(): void
    {
        User::create(['phone' => '0901234599', 'role' => 'customer']);

        $this->postJson('/api/auth/reset-password', [
            'phone'    => '+84 90 123 4599',
            'otp'      => '000000',
            'password' => '222222',
        ])->assertOk();
    }
}
