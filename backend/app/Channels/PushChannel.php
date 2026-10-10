<?php
// backend/app/Channels/PushChannel.php
namespace App\Channels;

use App\Channels\Push\FcmTransport;
use App\Channels\Push\WebPushTransport;
use App\Models\DeviceToken;

/**
 * Kênh push duy nhất cho mọi notification. Notification chỉ viết payload MỘT
 * lần ở toPush(); kênh tự chia token theo loại và giao cho transport tương ứng.
 * Mỗi transport tự nuốt lỗi — FCM hỏng không chặn Web Push và ngược lại.
 */
class PushChannel
{
    public function __construct(
        private WebPushTransport $webPush,
        private FcmTransport $fcm,
    ) {}

    public function send($notifiable, $notification): void
    {
        if (! method_exists($notification, 'toPush')) {
            return;
        }

        $tokens = DeviceToken::where('user_id', $notifiable->id)->get();
        if ($tokens->isEmpty()) {
            return;
        }

        $payload = $notification->toPush($notifiable, $notification);

        [$fcm, $web] = $tokens->partition(fn (DeviceToken $t) => $t->fcm_token !== null);

        if ($web->isNotEmpty()) {
            $this->webPush->send($web->values(), $payload);
        }
        if ($fcm->isNotEmpty()) {
            $this->fcm->send($fcm->values(), $payload);
        }
    }
}
