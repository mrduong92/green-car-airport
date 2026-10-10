<?php
// backend/app/Services/Fcm/FcmSendResult.php
namespace App\Services\Fcm;

final class FcmSendResult
{
    /**
     * @param  list<string>  $delivered  token gửi thành công
     * @param  list<string>  $invalid    token FCM báo không còn hợp lệ — cần xoá
     */
    public function __construct(
        public readonly array $delivered = [],
        public readonly array $invalid = [],
    ) {}
}
