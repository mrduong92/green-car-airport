<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Mã giới thiệu dạng số điện thoại (thay cho GCA-XXXXXX khó nhập). Mã GCA- cũ vẫn dùng được.
class ReferralByPhoneTest extends TestCase
{
    use RefreshDatabase;

    private function registerCustomer(string $phone, ?string $referral): void
    {
        $this->postJson('/api/auth/register', array_filter([
            'phone' => $phone, 'otp' => '000000', 'password' => '123456', 'referral_code' => $referral,
        ]))->assertOk();
    }

    private function registerDriver(string $phone, ?string $referral): void
    {
        $this->postJson('/api/auth/register/driver', array_filter([
            'phone' => $phone, 'otp' => '000000', 'password' => '123456', 'name' => 'Tài Xế Mới',
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '51G-99999',
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4',
            'cccd_number' => '0123456789', 'gplx_number' => 'B123456', 'vehicle_reg_number' => 'REG123',
            'vehicle_inspection_number' => 'INS123', 'vehicle_inspection_expiry' => '2027-01-01',
            'insurance_number' => 'BH123', 'insurance_expiry' => '2027-01-01', 'referral_code' => $referral,
        ]))->assertCreated();
    }

    private function referredBy(string $phone, string $role): ?int
    {
        return User::where('phone', $phone)->where('role', $role)->value('referred_by_user_id');
    }

    public function test_driver_registers_with_referrer_phone_in_any_format(): void
    {
        $referrer = User::factory()->create(['role' => 'driver', 'phone' => '0912345678']);

        foreach (['0912345678', '84912345678', '+84 912 345 678', '0912.345.678'] as $i => $input) {
            $phone = '090000000'.$i;
            $this->registerDriver($phone, $input);
            $this->assertSame($referrer->id, $this->referredBy($phone, 'driver'), "định dạng: $input");
        }
    }

    public function test_customer_registers_with_referrer_phone(): void
    {
        $referrer = User::factory()->create(['role' => 'customer', 'phone' => '0912345678']);

        $this->registerCustomer('0987654321', '0912 345 678');

        $this->assertSame($referrer->id, $this->referredBy('0987654321', 'customer'));
    }

    // Một số điện thoại có thể có cả tài khoản khách lẫn tài xế: chọn đúng vai trò của form đăng ký.
    public function test_phone_with_two_accounts_picks_the_role_of_the_registration_form(): void
    {
        $asCustomer = User::factory()->create(['role' => 'customer', 'phone' => '0912345678']);
        $asDriver = User::factory()->create(['role' => 'driver', 'phone' => '0912345678']);

        $this->registerDriver('0911111111', '0912345678');
        $this->registerCustomer('0922222222', '0912345678');

        $this->assertSame($asDriver->id, $this->referredBy('0911111111', 'driver'));
        $this->assertSame($asCustomer->id, $this->referredBy('0922222222', 'customer'));
    }

    public function test_customer_form_falls_back_to_driver_account_of_that_phone(): void
    {
        $driver = User::factory()->create(['role' => 'driver', 'phone' => '0912345678']);

        $this->registerCustomer('0922222222', '0912345678');

        $this->assertSame($driver->id, $this->referredBy('0922222222', 'customer'));
    }

    // Tài xế đăng ký thêm tài khoản khách cùng số (hoặc ngược lại) không được tự giới thiệu mình.
    public function test_cannot_refer_yourself_by_phone_in_either_form(): void
    {
        User::factory()->create(['role' => 'driver', 'phone' => '0912345678']);
        User::factory()->create(['role' => 'customer', 'phone' => '0933333333']);

        $this->registerCustomer('0912345678', '0912345678');
        $this->registerDriver('0933333333', '+84933333333');

        $this->assertNull($this->referredBy('0912345678', 'customer'));
        $this->assertNull($this->referredBy('0933333333', 'driver'));
    }

    public function test_old_code_still_works_case_insensitively_and_unknown_phone_is_ignored(): void
    {
        $referrer = User::factory()->create(['role' => 'driver']);

        $this->registerDriver('0911111111', strtolower($referrer->referral_code));
        $this->registerCustomer('0922222222', '0999999999');

        $this->assertSame($referrer->id, $this->referredBy('0911111111', 'driver'));
        $this->assertNull($this->referredBy('0922222222', 'customer'));
    }
}
