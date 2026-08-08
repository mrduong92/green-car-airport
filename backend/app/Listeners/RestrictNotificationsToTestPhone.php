<?php

namespace App\Listeners;

use Illuminate\Notifications\Events\NotificationSending;
use Illuminate\Support\Facades\Log;

/**
 * Van an toàn để test trên production: khi `NOTIFY_ONLY_PHONE` được đặt, MỌI
 * notification gửi tới số khác đều bị huỷ.
 *
 * Vì sao chặn ở tầng chung thay vì sửa riêng SendNewBookingBroadcastJob: một
 * cuốc test kéo theo nhiều loại notification (cuốc mới cho tài xế, nhận cuốc,
 * hoàn thành, nạp điểm…) đi qua nhiều kênh, trong đó có ZNS — **gửi nhầm là
 * tốn tiền thật và làm phiền người dùng thật**. Chặn ở đây thì không sót kênh nào.
 *
 * ⚠️ Bỏ biến này ngay sau khi test xong. Để quên = toàn hệ thống ngừng gửi
 * thông báo mà không có lỗi nào — đúng kiểu hỏng âm thầm. Vì vậy mỗi lần chặn
 * đều ghi log mức WARNING để bộ giám sát nhìn thấy.
 */
class RestrictNotificationsToTestPhone
{
    public function handle(NotificationSending $event): bool
    {
        $only = config('services.notify_only_phone');

        if (blank($only)) {
            return true;
        }

        $phone = $event->notifiable->phone ?? null;

        if ($phone === $only) {
            return true;
        }

        Log::warning('[NOTIFY_ONLY_PHONE] Đã CHẶN notification — chế độ test đang bật', [
            'notification' => $event->notification::class,
            'channel' => $event->channel,
            'to_phone' => $phone,
            'allowed_phone' => $only,
        ]);

        return false;
    }
}
