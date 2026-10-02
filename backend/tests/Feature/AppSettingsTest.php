<?php
// backend/tests/Feature/AppSettingsTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_contact_endpoint_returns_defaults_when_unseeded(): void
    {
        $this->getJson('/api/settings/contact')
            ->assertOk()
            ->assertJson([
                'hotline'    => '1800 6789',
                'email'      => 'support@greenca.vn',
                'zalo_phone' => '0931919786',
            ]);
    }

    public function test_public_contact_endpoint_reflects_admin_saved_values(): void
    {
        AppSetting::set(AppSetting::CONTACT_ZALO_PHONE, '0931919786');

        $this->getJson('/api/settings/contact')
            ->assertOk()
            ->assertJsonFragment(['zalo_phone' => '0931919786']);
    }

    public function test_admin_can_update_contact_settings(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', [
                'contact_hotline'    => '1900 1234',
                'contact_email'      => 'help@greenca.vn',
                'contact_zalo_phone' => '0931919786',
            ])
            ->assertOk()
            ->assertJson(['contact_zalo_phone' => '0931919786']);

        $this->getJson('/api/settings/contact')
            ->assertJsonFragment(['hotline' => '1900 1234']);
    }

    public function test_non_admin_cannot_update_contact_settings(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $this->actingAs($driver, 'sanctum')
            ->putJson('/api/admin/settings', [
                'contact_hotline'    => '1900 1234',
                'contact_email'      => 'help@greenca.vn',
                'contact_zalo_phone' => '0931919786',
            ])
            ->assertStatus(403);
    }

    public function test_update_rejects_invalid_email(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', [
                'contact_hotline'    => '1900 1234',
                'contact_email'      => 'not-an-email',
                'contact_zalo_phone' => '0931919786',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['contact_email']);
    }

    public function test_business_settings_default_to_config_values(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/settings')
            ->assertOk()
            ->assertJson([
                'app_fee_percent'        => 20,
                'referral_voucher_value' => 100000,
                'referral_driver_points' => 50,
            ]);
    }

    public function test_admin_can_update_fee_and_referral_settings_and_they_take_effect(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', [
                'contact_hotline'        => '1900 1234',
                'contact_email'          => 'help@greenca.vn',
                'contact_zalo_phone'     => '0931919786',
                'app_fee_percent'        => 15,
                'referral_voucher_value' => 70000,
                'referral_driver_points' => 30,
            ])
            ->assertOk()
            ->assertJson(['app_fee_percent' => 15]);

        $this->getJson('/api/settings/contact')->assertJsonFragment(['app_fee_percent' => 15]);

        $referrer = User::factory()->create(['role' => 'customer']);
        $new      = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        app(\App\Services\ReferralService::class)->processCustomerReferral($new);
        $this->assertEquals(70000, \App\Models\Voucher::where('user_id', $referrer->id)->value('value'));
    }

    public function test_update_rejects_fee_percent_over_100(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings', [
                'contact_hotline'    => '1900 1234',
                'contact_email'      => 'help@greenca.vn',
                'contact_zalo_phone' => '0931919786',
                'app_fee_percent'    => 101,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['app_fee_percent']);
    }
}
