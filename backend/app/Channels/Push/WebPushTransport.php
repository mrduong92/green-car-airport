<?php
// backend/app/Channels/Push/WebPushTransport.php
namespace App\Channels\Push;

use App\Models\DeviceToken;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class WebPushTransport
{
    /** @param Collection<int, DeviceToken> $tokens  chỉ dòng có endpoint */
    public function send(Collection $tokens, array $payload): void
    {
        try {
            $webPush = new WebPush(['VAPID' => [
                'subject'    => config('services.vapid.subject'),
                'publicKey'  => config('services.vapid.public_key'),
                'privateKey' => config('services.vapid.private_key'),
            ]]);

            // channel/ttl là khái niệm của FCM; sw.ts không dùng — gửi đúng khung cũ.
            $body = json_encode(Arr::except($payload, ['channel', 'ttl']));

            foreach ($tokens as $token) {
                $sub = Subscription::create([
                    'endpoint' => $token->endpoint,
                    'keys'     => ['p256dh' => $token->p256dh, 'auth' => $token->auth],
                ]);
                $webPush->queueNotification($sub, $body);
            }

            foreach ($webPush->flush() as $report) {
                if ($report->isSubscriptionExpired()) {
                    DeviceToken::where('endpoint', $report->getEndpoint())->delete();
                } elseif ($report->isSuccess()) {
                    DeviceToken::where('endpoint', $report->getEndpoint())
                        ->update(['last_used_at' => now()]);
                }
            }
        } catch (\Throwable $e) {
            // VAPID keys not configured or other push error — fail silently
            Log::warning('WebPushTransport error: '.$e->getMessage());
        }
    }
}
