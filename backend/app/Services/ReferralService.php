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
    private const CUSTOMER_VOUCHER_VALUE     = 50000;
    private const REFERRER_VOUCHER_COUNT     = 2;
    private const NEW_CUSTOMER_VOUCHER_COUNT = 4;

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

        $completedCount = $customer->bookingsAsCustomer()->where('status', 'completed')->count();
        if ($completedCount !== 1) return;

        $customer->loadMissing('referredBy');

        DB::transaction(function () use ($customer) {
            $referrer = $customer->referredBy;
            $this->issueVouchers($referrer, self::REFERRER_VOUCHER_COUNT);
            $this->issueVouchers($customer, self::NEW_CUSTOMER_VOUCHER_COUNT);
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

    private function issueVouchers(User $user, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $this->voucherIssuer->issue($user, 'REF', self::CUSTOMER_VOUCHER_VALUE, now()->addMonth());
        }
    }
}
