<?php
// backend/app/Services/ReferralService.php
namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;

class ReferralService
{
    // Mức thưởng do admin chỉnh ở trang Cài đặt (AppSetting, mặc định ở config/business.php):
    // - tài xế: điểm cho MỖI bên (1 điểm = 1.000đ);
    // - khách: 1 voucher cho người giới thiệu ngay khi khách được giới thiệu đăng ký xong
    //   (khách mới tự nhận voucher chào mừng qua Campaign, không cấp thêm ở đây).

    public function __construct(private VoucherIssuer $voucherIssuer) {}

    public function processDriverReferral(User $driver): void
    {
        if ($driver->referral_rewarded_at !== null) return;
        if ($driver->referred_by_user_id === null) return;

        $driver->loadMissing('referredBy', 'driverProfile');

        if ($driver->referredBy?->role !== 'driver') return;
        if (($driver->driverProfile?->trips_count ?? 0) < 1) return;
        if (($driver->driverProfile?->status) !== 'active') return;

        DB::transaction(function () use ($driver) {
            $referrer = $driver->referredBy;
            $points = AppSetting::referralDriverPoints();
            $this->creditPoints($referrer, $points, "Thưởng giới thiệu tài xế #{$driver->id}");
            $this->creditPoints($driver,   $points, "Thưởng được giới thiệu bởi tài xế #{$referrer->id}");
            $driver->update(['referral_rewarded_at' => now()]);
        });
    }

    public function processCustomerReferral(User $customer): void
    {
        if ($customer->referral_rewarded_at !== null) return;
        if ($customer->referred_by_user_id === null) return;

        $customer->loadMissing('referredBy');
        $referrer = $customer->referredBy;
        if ($referrer === null) return;

        DB::transaction(function () use ($customer, $referrer) {
            $this->voucherIssuer->issue($referrer, config('business.referral_voucher_prefix'), AppSetting::referralVoucherValue(), now()->addMonth());
            $customer->update(['referral_rewarded_at' => now()]);
        });
    }

    private function creditPoints(User $user, int $points, string $description): void
    {
        $wallet = $user->wallet()->firstOrCreate(['user_id' => $user->id], ['points' => 0]);
        $wallet->increment('points', $points);
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'referral',
            'description' => $description,
            'points'      => $points,
        ]);
    }
}
