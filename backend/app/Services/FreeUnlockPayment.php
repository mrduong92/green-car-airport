<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;

// Thông tin chuyển khoản phí mở khóa Nhận cuốc (tab Free) hiện trong popup khi tài xế chưa mở khóa.
// Dùng chung tài khoản nhận tiền với nạp điểm (config/sepay.php) nhưng nội dung chuyển khoản KHÁC:
// webhook SePay cộng điểm ví cho mọi nội dung khớp mã nạp (GCA + 6 số), nên ở đây KHÔNG dùng
// payment_code mà dùng "MOKHOA <số điện thoại>" — không khớp, admin tra tài xế theo số điện thoại.
class FreeUnlockPayment
{
    /** @return array{amount_vnd: int|null, transfer_content: string, bank: array{name: mixed, account_number: string, account_holder: string}, qr_url: string|null} */
    public static function forDriver(User $user): array
    {
        $content = 'MOKHOA '.$user->phone;
        $amount = AppSetting::freeUnlockFeeVnd();
        $amount = $amount > 0 ? $amount : null;

        $bankCode = (string) config('sepay.bank.bank_code', 'VCB');
        $accountNumber = (string) config('sepay.bank.account_number', '');
        $accountHolder = (string) config('sepay.bank.account_holder', '');

        $qrUrl = null;
        if ($accountNumber !== '') {
            $qrUrl = sprintf('https://img.vietqr.io/image/%s-%s-compact2.png?', $bankCode, $accountNumber)
                .($amount !== null ? "amount={$amount}&" : '')
                .sprintf('addInfo=%s&accountName=%s', urlencode($content), urlencode($accountHolder));
        }

        return [
            'amount_vnd' => $amount,
            'transfer_content' => $content,
            'bank' => [
                'name' => config('sepay.bank.name'),
                'account_number' => $accountNumber,
                'account_holder' => $accountHolder,
            ],
            'qr_url' => $qrUrl,
        ];
    }
}
