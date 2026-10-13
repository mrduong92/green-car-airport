<?php

// backend/tests/Feature/ReferralDeletedReferrerTest.php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Services\AccountDeletionService;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReferralDeletedReferrerTest extends TestCase
{
    use RefreshDatabase;

    public function test_khach_gioi_thieu_da_xoa_khong_nhan_voucher(): void
    {
        $referrer = User::factory()->create(['role' => 'customer']);
        $customer = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $referrer->id]);
        app(AccountDeletionService::class)->delete($referrer);

        app(ReferralService::class)->processCustomerReferral($customer->fresh());

        $this->assertSame(0, Voucher::where('user_id', $referrer->id)->count());
    }

    public function test_tai_xe_gioi_thieu_da_xoa_khong_duoc_cong_diem_nguoi_moi_van_nhan(): void
    {
        $referrer = User::factory()->create(['role' => 'driver']);
        $driver = User::factory()->create(['role' => 'driver', 'referred_by_user_id' => $referrer->id]);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-2',
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active', 'trips_count' => 1,
        ]);
        app(AccountDeletionService::class)->delete($referrer);

        app(ReferralService::class)->processDriverReferral($driver->fresh());

        $this->assertSame(0, (int) Wallet::where('user_id', $referrer->id)->value('points'));
        $this->assertGreaterThan(0, (int) Wallet::where('user_id', $driver->id)->value('points'));
        $this->assertNotNull($driver->fresh()->referral_rewarded_at);
    }
}
