<?php
// backend/tests/Feature/RegistrationOtpSessionTest.php

namespace Tests\Feature;

use App\Models\Otp;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * BUG production 2026-08-10: tài xế nhập OTP đúng ở bước 2, điền tiếp 4 bước
 * (có bước tra 7 ô giấy tờ), tới submit cuối thì nhận "Mã OTP không hợp lệ hoặc
 * đã hết hạn" — vì nút "Xác nhận OTP" chỉ `setStep(3)` chứ không gọi backend,
 * còn OTP chỉ sống 5 phút và mãi tới submit cuối mới được kiểm.
 *
 * Cách sửa: tách làm HAI đồng hồ.
 *   - Mã OTP vẫn 5 phút (vừa nhận SMS xong nên hợp lý)
 *   - Dấu đã-xác-thực (`otps.verified_at`) KHÔNG giới hạn thời gian
 * Bước cuối không kiểm mã OTP nữa, chỉ kiểm dấu đã-xác-thực + chưa dùng.
 */
class RegistrationOtpSessionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * `consumeOtp`/`consumeVerifiedOtp` thoát sớm khi env là local/testing, nên
     * muốn chạm được đường thật thì phải giả lập production. Không có bước này
     * thì mọi test dưới đây "xanh" một cách vô nghĩa.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->app->detectEnvironment(fn () => 'production');
    }

    private function driverPayload(array $overrides = []): array
    {
        return array_merge([
            'phone'                     => '0911111111',
            'password'                  => '123456',
            'name'                      => 'Tài Xế Test',
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Vios',
            'vehicle_plate'             => '51G-11111',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'cccd_number'               => '079123456789',
            'gplx_number'               => '012345678910',
            'vehicle_reg_number'        => '29A-11111',
            'vehicle_inspection_number' => 'DK111111',
            'vehicle_inspection_expiry' => now()->addYear()->format('Y-m-d'),
            'insurance_number'          => 'BH111111',
            'insurance_expiry'          => now()->addYear()->format('Y-m-d'),
        ], $overrides);
    }

    private function makeOtp(string $phone, array $overrides = []): Otp
    {
        return Otp::create(array_merge([
            'phone'      => $phone,
            'code'       => '654321',
            'expires_at' => now()->addMinutes(5),
        ], $overrides));
    }

    // ── Bước 2: xác thực OTP ────────────────────────────────────────────────

    public function test_xac_thuc_otp_dung_thi_danh_dau_verified(): void
    {
        $otp = $this->makeOtp('0911111111');

        $this->postJson('/api/auth/otp/verify-registration', [
            'phone' => '0911111111',
            'otp'   => '654321',
        ])->assertOk();

        $this->assertNotNull($otp->fresh()->verified_at);
        // Chưa dùng — mới chỉ xác thực
        $this->assertNull($otp->fresh()->used_at);
    }

    public function test_otp_sai_thi_khong_danh_dau_verified(): void
    {
        $otp = $this->makeOtp('0911111111');

        $this->postJson('/api/auth/otp/verify-registration', [
            'phone' => '0911111111',
            'otp'   => '000999',
        ])->assertStatus(422);

        $this->assertNull($otp->fresh()->verified_at);
    }

    public function test_otp_het_han_thi_khong_danh_dau_verified(): void
    {
        $otp = $this->makeOtp('0911111111', ['expires_at' => now()->subMinute()]);

        $this->postJson('/api/auth/otp/verify-registration', [
            'phone' => '0911111111',
            'otp'   => '654321',
        ])->assertStatus(422);

        $this->assertNull($otp->fresh()->verified_at);
    }

    // ── Bước cuối: dùng dấu đã-xác-thực ─────────────────────────────────────

    public function test_dang_ky_tai_xe_thanh_cong_bang_dau_da_xac_thuc(): void
    {
        $otp = $this->makeOtp('0911111111', ['verified_at' => now()]);

        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertCreated();

        $this->assertDatabaseHas('users', ['phone' => '0911111111', 'role' => 'driver']);
        $this->assertNotNull($otp->fresh()->used_at);
    }

    /**
     * Đây là bản chất của bug: mã OTP đã quá 5 phút, nhưng người dùng đã xác
     * thực ở bước 2 nên vẫn phải đăng ký được.
     */
    public function test_dau_da_xac_thuc_van_dung_duoc_khi_ma_otp_da_qua_han(): void
    {
        $this->makeOtp('0911111111', [
            'expires_at'  => now()->subHours(2),   // mã OTP hết hạn từ lâu
            'verified_at' => now()->subHours(2),
        ]);

        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertCreated();
    }

    /** Không giới hạn thời gian cho dấu đã-xác-thực — quyết định 2026-08-11. */
    public function test_dau_da_xac_thuc_khong_gioi_han_thoi_gian(): void
    {
        $this->makeOtp('0911111111', [
            'expires_at'  => now()->subDays(30),
            'verified_at' => now()->subDays(30),
        ]);

        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertCreated();
    }

    public function test_chua_xac_thuc_thi_khong_dang_ky_duoc(): void
    {
        $this->makeOtp('0911111111');   // verified_at NULL

        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertStatus(422);

        $this->assertDatabaseMissing('users', ['phone' => '0911111111']);
    }

    public function test_dau_da_dung_thi_khong_dung_lai_duoc(): void
    {
        $this->makeOtp('0911111111', ['verified_at' => now(), 'used_at' => now()]);

        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertStatus(422);

        $this->assertDatabaseMissing('users', ['phone' => '0911111111']);
    }

    public function test_khong_co_dong_otp_nao_thi_khong_dang_ky_duoc(): void
    {
        $this->postJson('/api/auth/register/driver', $this->driverPayload())
            ->assertStatus(422);

        $this->assertDatabaseMissing('users', ['phone' => '0911111111']);
    }

    // ── Khách hàng: cùng cơ chế ─────────────────────────────────────────────

    public function test_dang_ky_khach_hang_dung_dau_da_xac_thuc(): void
    {
        $otp = $this->makeOtp('0922222222', ['verified_at' => now()]);

        // register() khách hàng trả 200, chỉ registerDriver() trả 201
        $this->postJson('/api/auth/register', [
            'phone'    => '0922222222',
            'password' => '123456',
            'name'     => 'Khách Test',
        ])->assertOk();

        $this->assertDatabaseHas('users', ['phone' => '0922222222', 'role' => 'customer']);
        $this->assertNotNull($otp->fresh()->used_at);
    }

    // ── Tương thích ngược với app cũ ────────────────────────────────────────

    /**
     * PWA đã cài trên máy người dùng KHÔNG tự cập nhật (xem docs/BACKLOG.md P0-3),
     * nên bản cũ vẫn gửi kèm `otp` ở submit cuối và không gọi endpoint bước 2.
     * Đường cũ phải tiếp tục chạy, nếu không là chặn hết người đang dùng bản cũ.
     */
    public function test_client_cu_gui_kem_otp_van_dang_ky_duoc(): void
    {
        $otp = $this->makeOtp('0933333333');   // chưa verified, còn hạn

        $this->postJson('/api/auth/register/driver', $this->driverPayload([
            'phone' => '0933333333',
            'otp'   => '654321',
        ]))->assertCreated();

        $this->assertNotNull($otp->fresh()->used_at);
    }
}
