<?php
// backend/app/Services/Fcm/FcmSender.php
namespace App\Services\Fcm;

/**
 * Ranh giới với Firebase. FcmTransport chỉ biết interface này nên test được mà
 * không cần Firebase thật; đổi thư viện gửi chỉ phải viết lại một adapter.
 */
interface FcmSender
{
    /**
     * @param  list<string>  $tokens
     * @param  array<string, mixed>  $message  message FCM HTTP v1, không có khoá `token`
     */
    public function send(array $tokens, array $message): FcmSendResult;
}
