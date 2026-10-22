<?php

// backend/app/Services/AffiliateService.php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;

/**
 * Điểm thưởng affiliate (spec docs/superpowers/specs/2026-10-15-affiliate-design.md):
 * hoàn cashback% cho khách + commission% cho người giới thiệu (khách) khi chuyến hoàn thành,
 * khách dùng điểm trừ tối đa max_rate% giá cơ sở khi đặt. Mọi hàm ghi sổ phải gọi trong transaction
 * của luồng gọi; hoàn và cộng đều "claim" bằng UPDATE có điều kiện để gọi lại không ghi hai lần.
 */
class AffiliateService
{
    /** Điểm = ⌊basePrice × percent% / 1000⌋ (1 điểm = 1.000đ, làm tròn xuống). */
    public static function rewardPoints(int $basePrice, float $percent): int
    {
        if ($basePrice <= 0 || $percent <= 0) {
            return 0;
        }

        return (int) floor($basePrice * $percent / 100 / 1000);
    }

    /** Điểm được dùng cho một cuốc: min(số dư điểm thưởng, trần max_rate% giá cơ sở). Nguồn DUY NHẤT — hold() gọi trên số dư đã khoá. */
    public static function cap(int $balance, int $basePrice): int
    {
        if (! AppSetting::pointsSpendEnabled()) {
            return 0;
        }

        return max(0, min($balance, self::rewardPoints($basePrice, AppSetting::pointsMaxRatePercent())));
    }

    public function hold(Booking $booking): int
    {
        $wallet = Wallet::lockedFor($booking->customer_id);
        $points = self::cap((int) $wallet->reward_points, $booking->basePrice());
        if ($points <= 0) {
            return 0;
        }

        $wallet->debitReward($points, 'spend', "Dùng điểm cuốc #{$booking->id}", $booking->id);
        $booking->forceFill(['points_used' => $points])->save();

        return $points;
    }

    public function refund(Booking $booking, string $reason): int
    {
        $claimed = Booking::whereKey($booking->id)
            ->where('points_used', '>', 0)
            ->whereNull('points_refunded_at')
            ->update(['points_refunded_at' => now()]);
        if ($claimed === 0) {
            return 0;
        }

        $points = (int) Booking::whereKey($booking->id)->value('points_used');
        Wallet::lockedFor($booking->customer_id)
            ->creditReward($points, 'refund', "Hoàn điểm cuốc #{$booking->id} ({$reason})", $booking->id);

        return $points;
    }

    public function settle(Booking $booking): array
    {
        $none = ['cashback' => 0, 'commission' => 0, 'referrer_id' => null];

        $base = $booking->basePrice();
        $cashback = self::rewardPoints($base, AppSetting::cashbackPercent());

        $customer = User::find($booking->customer_id);
        $referrer = $customer?->referred_by_user_id ? User::find($customer->referred_by_user_id) : null;
        // Tài khoản người giới thiệu đã bị xoá (ẩn danh hoá, hàng vẫn còn — User
        // không dùng SoftDeletes) thì không cộng hoa hồng: họ không còn nhận biết
        // hay rút được điểm, cộng vào chỉ là tiền app mất không.
        $commission = $referrer && $referrer->role === 'customer' && $referrer->deleted_at === null
            ? self::rewardPoints($base, AppSetting::commissionPercent())
            : 0;

        $claimed = Booking::whereKey($booking->id)
            ->whereNull('cashback_points')
            ->update(['cashback_points' => $cashback, 'commission_points' => $commission]);
        if ($claimed === 0) {
            return $none;
        }

        Wallet::lockedFor($booking->customer_id)
            ->creditReward($cashback, 'cashback', "Hoàn điểm cuốc #{$booking->id}", $booking->id);
        if ($commission > 0) {
            Wallet::lockedFor($referrer->id)
                ->creditReward($commission, 'commission', "Hoa hồng cuốc #{$booking->id} của bạn bè", $booking->id);
        }

        return ['cashback' => $cashback, 'commission' => $commission, 'referrer_id' => $commission > 0 ? $referrer->id : null];
    }
}
