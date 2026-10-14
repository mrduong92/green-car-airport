<?php
// backend/app/Services/Fcm/NullFcmSender.php
namespace App\Services\Fcm;

use Illuminate\Support\Facades\Log;

/**
 * Dùng khi server chưa có FIREBASE_CREDENTIALS (vd staging chưa đặt file).
 * Không ném lỗi để Web Push vẫn chạy; KHÔNG báo token chết để khỏi xoá oan.
 */
final class NullFcmSender implements FcmSender
{
    public function send(array $tokens, array $message): FcmSendResult
    {
        Log::warning('[FCM] Chưa cấu hình FIREBASE_CREDENTIALS — bỏ qua '.count($tokens).' token app native');

        return new FcmSendResult();
    }
}
