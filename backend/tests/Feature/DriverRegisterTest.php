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

    private function docPayload(array $overrides = []): array
    {
        return array_merge([
            'cccd_number'               => '079123456789',
            'gplx_number'               => '012345678910',
            'vehicle_reg_number'        => '29A-11111',
            'vehicle_inspection_number' => 'DK123456',
            'vehicle_inspection_expiry' => now()->addYear()->format('Y-m-d'),
            'insurance_number'          => 'BH789012',
            'insurance_expiry'          => now()->addYear()->format('Y-m-d'),
        ], $overrides);
    }

    private function validDriverPayload(array $overrides = []): array
    {
        return array_merge($this->payload(), $this->docPayload(), $overrides);
    }

    public function test_driver_register_creates_user_with_driver_role(): void
    {
        $data = $this->validDriverPayload();

        $this->postJson('/api/auth/register/driver', $data)
            ->assertCreated()
            ->assertJsonPath('user.role', 'driver')
            ->assertJsonStructure(['token', 'user']);

        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
    }

    public function test_driver_register_creates_driver_profile_with_vehicle_type(): void
    {
        $data = array_merge($this->payload(), $this->docPayload());

        $this->postJson('/api/auth/register/driver', $data)
            ->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => '51G-11111',
            'vehicle_type'  => 'sedan_4',
            'is_verified'   => 0,
        ]);
    }

    public function test_driver_register_creates_wallet(): void
    {
        $this->postJson('/api/auth/register/driver', array_merge($this->payload(), $this->docPayload()))
            ->assertCreated();

        $user = User::where('phone', '0911111111')->first();
        $this->assertDatabaseHas('wallets', ['user_id' => $user->id, 'points' => 0]);
    }

    public function test_driver_register_needs_onboarding_is_false(): void
    {
        $response = $this->postJson('/api/auth/register/driver', array_merge($this->payload(), $this->docPayload()))
            ->assertCreated();

        $this->assertFalse($response->json('user.needs_onboarding'));
    }

    public function test_driver_register_rejects_duplicate_phone(): void
    {
        $data = array_merge($this->payload(), $this->docPayload());

        $this->postJson('/api/auth/register/driver', $data)->assertCreated();

        $this->postJson('/api/auth/register/driver', $data)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Số điện thoại đã được đăng ký là tài xế.');
    }

    public function test_driver_register_rejects_invalid_vehicle_type(): void
    {
        $this->postJson('/api/auth/register/driver', array_merge($this->payload(['vehicle_type' => 'bike']), $this->docPayload()))
            ->assertStatus(422);
    }

    public function test_driver_register_requires_vehicle_plate(): void
    {
        $this->postJson('/api/auth/register/driver', array_merge($this->payload(['vehicle_plate' => '']), $this->docPayload()))
            ->assertStatus(422);
    }

    public function test_driver_register_without_documents_returns_422(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cccd_number']);
    }

    public function test_driver_register_with_expired_date_returns_422(): void
    {
        $data = array_merge($this->payload(), $this->docPayload([
            'vehicle_inspection_expiry' => now()->subDay()->format('Y-m-d'),
        ]));

        $this->postJson('/api/auth/register/driver', $data)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['vehicle_inspection_expiry']);
    }

    /**
     * `otp` KHÔNG còn bắt buộc ở submit cuối — hợp đồng đổi ngày 2026-08-11.
     *
     * Form đăng ký giờ xác thực OTP ở bước 2 (`POST /auth/otp/verify-registration`)
     * và bước cuối chỉ dùng dấu `otps.verified_at`. Bắt buộc `otp` ở đây chính là
     * nguyên nhân bug production: mã sống 5 phút mà form có 6 bước.
     *
     * Vẫn gửi kèm `otp` thì vẫn chạy (app cũ chưa cập nhật). Việc chặn khi CHƯA
     * xác thực nằm ở RegistrationOtpSessionTest — phải giả lập env production
     * mới chạm được, vì `consumeVerifiedOtp` thoát sớm ở môi trường testing.
     */
    public function test_driver_register_khong_con_bat_buoc_otp_o_buoc_cuoi(): void
    {
        $data = array_merge($this->payload(), $this->docPayload());
        unset($data['otp']);

        $this->postJson('/api/auth/register/driver', $data)->assertCreated();

        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
    }

    public function test_driver_register_with_documents_creates_pending_profile(): void
    {
        $data = array_merge($this->payload(), $this->docPayload());

        $this->postJson('/api/auth/register/driver', $data)
            ->assertCreated()
            ->assertJsonPath('user.approval_status', 'pending');

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate'    => '51G-11111',
            'is_verified'      => 0,
            'cccd_number'      => '079123456789',
            'gplx_number'      => '012345678910',
            'insurance_number' => 'BH789012',
        ]);
    }

    public function test_driver_can_declare_private_plate_vehicle(): void
    {
        $payload = $this->validDriverPayload();
        $payload['is_vip'] = true;

        $this->postJson('/api/auth/register/driver', $payload)->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => $payload['vehicle_plate'],
            'is_vip' => true,
        ]);
    }

    public function test_driver_defaults_to_non_vip(): void
    {
        $payload = $this->validDriverPayload();

        $this->postJson('/api/auth/register/driver', $payload)->assertCreated();

        $this->assertDatabaseHas('driver_profiles', [
            'vehicle_plate' => $payload['vehicle_plate'],
            'is_vip' => false,
        ]);
    }
}
