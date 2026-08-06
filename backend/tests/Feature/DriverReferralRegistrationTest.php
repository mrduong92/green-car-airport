<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverReferralRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
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
        ], $overrides);
    }

    /** Đăng ký tài xế với mã giới thiệu hợp lệ lưu referred_by_user_id */
    public function test_driver_register_stores_referred_by_when_valid_referral_code(): void
    {
        $referrer = User::factory()->create(['role' => 'driver']);

        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => $referrer->referral_code,
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => $referrer->id,
        ]);
    }

    /** Mã giới thiệu không tồn tại thì bỏ qua, vẫn đăng ký thành công */
    public function test_driver_register_ignores_invalid_referral_code(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => 'GCA-ZZZZZZ',
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => null,
        ]);
    }

    /** Không gửi mã giới thiệu vẫn đăng ký thành công */
    public function test_driver_register_without_referral_code_succeeds(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'referred_by_user_id' => null,
        ]);
    }

    /** Không thể tự giới thiệu chính mình bằng mã của user cùng số điện thoại */
    public function test_driver_register_ignores_own_referral_code(): void
    {
        $self = User::factory()->create(['phone' => '0911111111', 'role' => 'customer']);

        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => $self->referral_code,
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => null,
        ]);
    }
}
