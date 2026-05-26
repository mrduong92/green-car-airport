<?php
namespace App\Channels;

use App\Models\DeviceToken;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

class WebPushChannel
{
    public function send($notifiable, $notification): void
    {
        if (! method_exists($notification, 'toWebPush')) return;

        $tokens = DeviceToken::where('user_id', $notifiable->id)->get();
        if ($tokens->isEmpty()) return;

        try {
            $webPush = new WebPush(['VAPID' => [
                'subject'    => config('services.vapid.subject'),
                'publicKey'  => config('services.vapid.public_key'),
                'privateKey' => config('services.vapid.private_key'),
            ]]);

            $payload = $notification->toWebPush($notifiable, $notification);

            foreach ($tokens as $token) {
                $sub = Subscription::create([
                    'endpoint' => $token->endpoint,
                    'keys'     => ['p256dh' => $token->p256dh, 'auth' => $token->auth],
                ]);
                $webPush->queueNotification($sub, json_encode($payload));
            }

            foreach ($webPush->flush() as $report) {
                if ($report->isSubscriptionExpired()) {
                    DeviceToken::where('endpoint', $report->getEndpoint())->delete();
                } elseif (! $report->isSuccess()) {
                    // log failure silently
                } else {
                    DeviceToken::where('endpoint', $report->getEndpoint())
                        ->update(['last_used_at' => now()]);
                }
            }
        } catch (\Throwable $e) {
            // VAPID keys not configured or other push error — fail silently
            \Illuminate\Support\Facades\Log::warning('WebPushChannel error: ' . $e->getMessage());
        }
    }
}
