<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerAlsoRegistersAsDriverTest extends TestCase
{
    use RefreshDatabase;

    private array $driverPayload = [
        'phone'                     => '0911111111',
        'password'                  => '123456',
        'name'                      => 'Tài Xế Mới',
        'vehicle_make'              => 'Toyota',
        'vehicle_model'             => 'Vios',
        'vehicle_plate'             => '51G-99999',
        'vehicle_year'              => 2022,
        'vehicle_color'             => 'Trắng',
        'vehicle_type'              => 'sedan_4',
        'cccd_number'               => '0123456789',
        'gplx_number'               => 'B123456',
        'vehicle_reg_number'        => 'REG123',
        'vehicle_inspection_number' => 'INS123',
        'vehicle_inspection_expiry' => '2027-01-01',
        'insurance_number'          => 'BH123',
        'insurance_expiry'          => '2027-01-01',
    ];

    /** Số điện thoại đã là khách hàng vẫn có thể đăng ký tài xế */
    public function test_customer_phone_can_register_as_driver(): void
    {
        User::factory()->create(['phone' => '0911111111', 'role' => 'customer']);

        $this->postJson('/api/auth/register/driver', $this->driverPayload)
            ->assertCreated()
            ->assertJsonPath('user.role', 'driver');

        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'customer']);
    }

    /** Số điện thoại đã là tài xế không thể đăng ký lại */
    public function test_driver_phone_cannot_register_as_driver_again(): void
    {
        User::factory()->create(['phone' => '0911111111', 'role' => 'driver']);

        $this->postJson('/api/auth/register/driver', $this->driverPayload)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Số điện thoại đã được đăng ký là tài xế.');
    }

    /** checkPhone trả về cả hai role khi cùng số điện thoại */
    public function test_check_phone_returns_both_roles(): void
    {
        User::factory()->create(['phone' => '0911111111', 'role' => 'customer']);
        User::factory()->create(['phone' => '0911111111', 'role' => 'driver']);

        $this->postJson('/api/auth/check-phone', ['phone' => '0911111111'])
            ->assertOk()
            ->assertJsonPath('exists', true)
            ->assertJsonFragment(['roles' => ['customer', 'driver']]);
    }

    /** login với role=driver trả về tài khoản tài xế */
    public function test_login_with_role_driver_returns_driver_account(): void
    {
        User::factory()->create(['phone' => '0911111111', 'role' => 'customer', 'password' => bcrypt('123456')]);
        User::factory()->create(['phone' => '0911111111', 'role' => 'driver', 'password' => bcrypt('123456')]);

        $this->postJson('/api/auth/login', [
            'phone'    => '0911111111',
            'password' => '000000',
            'role'     => 'driver',
        ])->assertOk()->assertJsonPath('user.role', 'driver');
    }

    /** login với role=customer trả về tài khoản khách hàng */
    public function test_login_with_role_customer_returns_customer_account(): void
    {
        User::factory()->create(['phone' => '0911111111', 'role' => 'customer', 'password' => bcrypt('123456')]);
        User::factory()->create(['phone' => '0911111111', 'role' => 'driver', 'password' => bcrypt('123456')]);

        $this->postJson('/api/auth/login', [
            'phone'    => '0911111111',
            'password' => '000000',
            'role'     => 'customer',
        ])->assertOk()->assertJsonPath('user.role', 'customer');
    }
}
