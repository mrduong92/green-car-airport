<?php
// backend/tests/Feature/AppVersionTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_mac_dinh_lay_tu_config_khong_can_dang_nhap(): void
    {
        $this->getJson('/api/app/version?app=driver&platform=android')
            ->assertOk()
            ->assertExactJson([
                'min_supported' => '1.0.0',
                'latest' => '1.0.0',
                'store_url' => 'https://play.google.com/store/apps/details?id=vn.greenca.driver',
            ]);
    }

    public function test_uu_tien_gia_tri_admin_da_luu(): void
    {
        AppSetting::set(AppSetting::appVersionKey('android', 'customer', 'min'), '1.2.0');
        AppSetting::set(AppSetting::appVersionKey('android', 'customer', 'latest'), '1.4.0');

        $this->getJson('/api/app/version?app=customer&platform=android')
            ->assertOk()
            ->assertJson(['min_supported' => '1.2.0', 'latest' => '1.4.0']);
    }

    public function test_tham_so_sai_thi_422(): void
    {
        $this->getJson('/api/app/version?app=admin&platform=android')->assertStatus(422);
        $this->getJson('/api/app/version?app=driver&platform=ios')->assertStatus(422);
        $this->getJson('/api/app/version')->assertStatus(422);
    }

    private function adminPut(array $extra)
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return $this->actingAs($admin, 'sanctum')->putJson('/api/admin/settings', [
            'contact_hotline' => '1800 6789',
            'contact_email' => 'support@greenca.vn',
            'contact_zalo_phone' => '0931919786',
            ...$extra,
        ]);
    }

    public function test_admin_luu_va_doc_phien_ban(): void
    {
        $this->adminPut([
            'app_version_android_driver_min' => '1.1.0',
            'app_version_android_driver_latest' => '1.3.0',
        ])->assertOk()->assertJson([
            'app_version_android_driver_min' => '1.1.0',
            'app_version_android_driver_latest' => '1.3.0',
            'app_version_android_customer_min' => '1.0.0',
        ]);
    }

    public function test_admin_nhap_sai_dinh_dang_thi_422(): void
    {
        $this->adminPut(['app_version_android_driver_min' => '1.0'])->assertStatus(422);
        $this->adminPut(['app_version_android_driver_min' => 'v1.0.0'])->assertStatus(422);
    }

    public function test_min_lon_hon_latest_thi_422_va_khong_luu(): void
    {
        $this->adminPut([
            'app_version_android_customer_min' => '2.0.0',
            'app_version_android_customer_latest' => '1.9.0',
        ])->assertStatus(422)->assertJsonValidationErrors('app_version_android_customer_min');

        // Chỉ gửi min, latest đang là mặc định 1.0.0 → cũng phải chặn.
        $this->adminPut(['app_version_android_driver_min' => '1.10.0'])
            ->assertStatus(422);

        $this->assertNull(AppSetting::get(AppSetting::appVersionKey('android', 'customer', 'min')));
    }
}
