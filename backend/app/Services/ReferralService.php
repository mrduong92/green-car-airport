<?php
// backend/app/Services/ReferralService.php
namespace App\Services;

use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;

class ReferralService
{
    // 1 điểm = 1.000đ, nên 50 điểm = 50.000đ cho MỖI bên (người giới thiệu và
    // tài xế được giới thiệu). Giảm từ 100 xuống 50 ngày 2026-08-08 theo yêu cầu.
    private const DRIVER_REWARD_POINTS       = 50;
    // Người giới thiệu nhận 1 voucher 100k ngay khi khách được giới thiệu đăng ký xong
    // (khách mới tự nhận voucher chào mừng qua Campaign, không cấp thêm ở đây).
    private const REFERRER_VOUCHER_VALUE = 100000;

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
            $this->creditPoints($referrer, self::DRIVER_REWARD_POINTS, "Thưởng giới thiệu tài xế #{$driver->id}");
            $this->creditPoints($driver,   self::DRIVER_REWARD_POINTS, "Thưởng được giới thiệu bởi tài xế #{$referrer->id}");
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
            $this->voucherIssuer->issue($referrer, 'REF', self::REFERRER_VOUCHER_VALUE, now()->addMonth());
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
