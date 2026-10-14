<?php
// backend/app/Channels/Push/FcmTransport.php
namespace App\Channels\Push;

use App\Models\DeviceToken;
use App\Services\Fcm\FcmSender;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Dịch payload trung tính của toPush() sang message FCM HTTP v1.
 *
 * Gửi dạng `notification` (không phải data-only): hệ thống Android tự hiện
 * thông báo kể cả khi app đã bị vuốt tắt — data-only thì phải có mã native
 * tự vẽ thông báo. Thêm iOS sau này = thêm khối `apns` ở buildMessage(), các
 * notification không phải sửa.
 */
class FcmTransport
{
    public const DEFAULT_CHANNEL = 'general';

    /** Kênh có âm báo riêng — tên file trong res/raw (không đuôi). */
    private const CHANNEL_SOUNDS = ['new_ride' => 'new_ride'];

    public function __construct(private FcmSender $sender) {}

    /** @param Collection<int, DeviceToken> $tokens  chỉ dòng có fcm_token */
    public function send(Collection $tokens, array $payload): void
    {
        $values = $tokens->pluck('fcm_token')->filter()->values()->all();
        if ($values === []) {
            return;
        }

        try {
            $result = $this->sender->send($values, self::buildMessage($payload));
        } catch (\Throwable $e) {
            Log::warning('FcmTransport error: '.$e->getMessage());

            return;
        }

        if ($result->invalid !== []) {
            DeviceToken::whereIn('fcm_token', $result->invalid)->delete();
        }
        if ($result->delivered !== []) {
            DeviceToken::whereIn('fcm_token', $result->delivered)->update(['last_used_at' => now()]);
        }
    }

    public static function buildMessage(array $payload): array
    {
        $channel = $payload['channel'] ?? self::DEFAULT_CHANNEL;

        // FCM từ chối CẢ message nếu một giá trị data không phải chuỗi.
        $data = collect($payload['data'] ?? [])
            ->reject(fn ($v) => $v === null)
            ->map(fn ($v) => is_bool($v) ? ($v ? '1' : '0') : (is_scalar($v) ? (string) $v : json_encode($v)))
            ->all();
        // JS cần biết kênh khi app đang mở (hệ thống không tự phát âm báo lúc đó).
        $data['channel'] = $channel;

        $notification = ['channel_id' => $channel, 'sound' => self::CHANNEL_SOUNDS[$channel] ?? 'default'];
        if (! empty($payload['tag'])) {
            $notification['tag'] = $payload['tag'];
        }

        $android = ['priority' => 'high', 'notification' => $notification];
        if (isset($payload['ttl'])) {
            $android['ttl'] = ((int) $payload['ttl']).'s';
        }

        return [
            'notification' => [
                'title' => (string) ($payload['title'] ?? config('app.name')),
                'body' => (string) ($payload['body'] ?? ''),
            ],
            'data' => $data,
            'android' => $android,
        ];
    }
}
