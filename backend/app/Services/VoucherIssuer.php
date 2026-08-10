<?php
// backend/app/Services/VoucherIssuer.php
namespace App\Services;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Support\Str;

/**
 * Tạo voucher cá nhân (target=specific, usage_limit=1) đúng chuẩn — NGUỒN DUY NHẤT.
 *
 * Trước đây ReferralService tự tạo voucher trực tiếp bằng Voucher::create(); giờ
 * CampaignService cũng cần đúng logic đó nên tách ra đây, để tránh lặp lại kiểu đã gây
 * bug push noti ngày 08/08 (quy tắc sức chứa xe nằm hai nơi, lệch nhau).
 */
class VoucherIssuer
{
    public function issue(User $user, string $codePrefix, int $value, \DateTimeInterface $expiresAt, ?int $campaignId = null): Voucher
    {
        return Voucher::create([
            'code'        => $this->uniqueCode($codePrefix, $user),
            'type'        => 'fixed',
            'value'       => $value,
            'target'      => 'specific',
            'user_id'     => $user->id,
            'campaign_id' => $campaignId,
            'expires_at'  => $expiresAt,
            'usage_limit' => 1,
            'usage_count' => 0,
            'is_active'   => true,
        ]);
    }

    private function uniqueCode(string $prefix, User $user): string
    {
        do {
            $code = $prefix . '-' . $user->id . '-' . strtoupper(Str::random(4));
        } while (Voucher::where('code', $code)->exists());

        return $code;
    }
}
