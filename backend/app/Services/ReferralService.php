<?php

// backend/app/Services/ReferralService.php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;
use App\Models\WalletTransaction;
use App\Support\PhoneNumber;
use Illuminate\Support\Facades\DB;

class ReferralService
{
    // Mức thưởng do admin chỉnh ở trang Cài đặt (AppSetting, mặc định ở config/business.php):
    // - tài xế: điểm cho MỖI bên (1 điểm = 1.000đ);
    // - khách: 1 voucher cho người giới thiệu ngay khi khách được giới thiệu đăng ký xong
    //   (khách mới tự nhận voucher chào mừng qua Campaign, không cấp thêm ở đây).

    public function __construct(private VoucherIssuer $voucherIssuer) {}

    /**
     * Người giới thiệu theo ô "Mã giới thiệu" lúc đăng ký: nhận số điện thoại (dễ nhập hơn mã
     * GCA-XXXXXX, mọi định dạng 0… / 84… / +84 …) hoặc mã GCA- cũ (link đã chia sẻ vẫn chạy).
     * Một số điện thoại có thể có cả tài khoản khách lẫn tài xế → ưu tiên tài khoản cùng vai trò với
     * form đang đăng ký. Không bao giờ trả về tài khoản trùng số với người đang đăng ký (tự giới thiệu).
     */
    public static function findReferrer(?string $input, string $role, string $newPhone): ?User
    {
        $input = trim((string) $input);
        if ($input === '') {
            return null;
        }

        if (preg_match('/^\+?[\d\s.\-]+$/', $input) && preg_match('/^\d{9,12}$/', preg_replace('/\D/', '', $input))) {
            $phone = PhoneNumber::normalize($input);
            if ($phone === $newPhone) {
                return null;
            }

            return User::where('phone', $phone)
                ->orderByRaw('role = ? DESC', [$role])
                ->orderByRaw("role = 'driver' DESC")
                ->first();
        }

        return User::where('referral_code', strtoupper($input))->where('phone', '!=', $newPhone)->first();
    }

    public function processDriverReferral(User $driver): void
    {
        if ($driver->referral_rewarded_at !== null) {
            return;
        }
        if ($driver->referred_by_user_id === null) {
            return;
        }

        $driver->loadMissing('referredBy', 'driverProfile');

        if ($driver->referredBy?->role !== 'driver') {
            return;
        }
        if (($driver->driverProfile?->trips_count ?? 0) < 1) {
            return;
        }
        if (($driver->driverProfile?->status) !== 'active') {
            return;
        }

        DB::transaction(function () use ($driver) {
            // Đọc lại có khoá: AccountDeletionService::delete khoá cùng dòng này rồi mới kiểm ví,
            // nên hoặc xoá chờ thưởng vào ví (rồi bị chặn vì ví > 0), hoặc thưởng thấy đã xoá.
            $referrer = User::lockForUpdate()->find($driver->referred_by_user_id);
            $points = AppSetting::referralDriverPoints();
            // Người giới thiệu đã xoá tài khoản: không cộng vào ví không còn ai quyết toán.
            if (! $referrer->isDeleted()) {
                $this->creditPoints($referrer, $points, "Thưởng giới thiệu tài xế #{$driver->id}");
            }
            $this->creditPoints($driver, $points, "Thưởng được giới thiệu bởi tài xế #{$referrer->id}");
            $driver->update(['referral_rewarded_at' => now()]);
        });
    }

    public function processCustomerReferral(User $customer): void
    {
        if ($customer->referral_rewarded_at !== null) {
            return;
        }
        if ($customer->referred_by_user_id === null) {
            return;
        }

        $customer->loadMissing('referredBy');
        $referrer = $customer->referredBy;
        if ($referrer === null || $referrer->isDeleted()) {
            return;
        }

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
            'wallet_id' => $wallet->id,
            'booking_id' => null,
            'type' => 'referral',
            'description' => $description,
            'points' => $points,
        ]);
    }
}
