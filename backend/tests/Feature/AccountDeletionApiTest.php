<?php

// backend/tests/Feature/AccountDeletionApiTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountDeletionApiTest extends TestCase
{
    use RefreshDatabase;

    private function customer(array $attrs = []): User
    {
        return User::factory()->create(array_merge([
            'role' => 'customer', 'phone' => '0901222333', 'password' => Hash::make('123456'),
        ], $attrs));
    }

    public function test_xoa_thanh_cong_token_cu_het_hieu_luc(): void
    {
        $user = $this->customer();
        $token = $user->createToken('app')->plainTextToken;

        $this->withToken($token)->deleteJson('/api/me', ['password' => '123456'])
            ->assertOk()
            ->assertJsonPath('message', 'Tài khoản của bạn đã được xoá.');

        $this->assertTrue($user->fresh()->isDeleted());
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_sau_khi_xoa_khong_dang_nhap_duoc_nhung_dang_ky_lai_duoc(): void
    {
        $user = $this->customer();
        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])->assertOk();

        $this->postJson('/api/auth/login', ['phone' => '0901222333', 'password' => '123456', 'role' => 'customer'])
            ->assertStatus(422);

        $this->postJson('/api/auth/register', [
            'phone' => '0901222333', 'otp' => '000000', 'password' => '654321', 'accept_terms' => true,
        ])->assertOk();

        $this->assertSame(2, User::where('role', 'customer')->count());
        $this->assertNotSame($user->id, User::where('phone', '0901222333')->value('id'));
    }

    public function test_sai_pin_422_khong_doi_gi(): void
    {
        $user = $this->customer();

        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Mã PIN không đúng.');

        $this->assertFalse($user->fresh()->isDeleted());
    }

    public function test_thieu_pin_bao_tieng_viet(): void
    {
        $this->actingAs($this->customer(), 'sanctum')->deleteJson('/api/me', [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Vui lòng nhập đủ 6 số PIN.');
    }

    public function test_bi_chan_tra_dung_thong_bao(): void
    {
        $user = $this->customer();
        Booking::create([
            'customer_id' => $user->id, 'pickup' => 'Hà Nội', 'destination' => 'Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'finding_driver',
        ]);

        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Bạn còn cuốc chưa hoàn thành. Vui lòng hoàn thành hoặc huỷ cuốc trước khi xoá tài khoản.');

        $this->assertFalse($user->fresh()->isDeleted());
    }

    public function test_admin_khong_tu_xoa_duoc(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'password' => Hash::make('123456')]);

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/me', ['password' => '123456'])->assertForbidden();
        $this->assertFalse($admin->fresh()->isDeleted());
    }

    // Xoá là vĩnh viễn: người cầm token bị lộ không được dò hết 10^6 mã PIN.
    public function test_gioi_han_so_lan_thu_pin(): void
    {
        $user = $this->customer();

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '000000'])->assertStatus(422);
        }
        $this->actingAs($user, 'sanctum')->deleteJson('/api/me', ['password' => '000000'])->assertStatus(429);
        $this->assertFalse($user->fresh()->isDeleted());
    }

    /** Tài khoản cũ chưa đặt PIN (login trả no_password) vẫn phải tự xoá được trong app. */
    public function test_tai_khoan_chua_dat_pin_xoa_duoc_khong_can_pin(): void
    {
        $user = $this->customer(['password' => null]);

        $this->actingAs($user, 'sanctum')->getJson('/api/auth/me')->assertJsonPath('has_password', false);
        $this->actingAs($user, 'sanctum')->deleteJson('/api/me')->assertOk();

        $this->assertTrue($user->fresh()->isDeleted());
    }

    public function test_tai_khoan_co_pin_van_bat_buoc_nhap_pin(): void
    {
        $user = $this->customer();

        $this->actingAs($user, 'sanctum')->getJson('/api/auth/me')->assertJsonPath('has_password', true);
        $this->actingAs($user, 'sanctum')->deleteJson('/api/me')->assertUnprocessable();

        $this->assertFalse($user->fresh()->isDeleted());
    }
}
