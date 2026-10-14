<?php
// backend/app/Services/Fcm/KreaitFcmSender.php
namespace App\Services\Fcm;

use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging\CloudMessage;

final class KreaitFcmSender implements FcmSender
{
    /** Giới hạn của FCM cho một lần multicast. */
    private const BATCH = 500;

    private ?Messaging $messaging = null;

    public function __construct(private string $credentials) {}

    public function send(array $tokens, array $message): FcmSendResult
    {
        $delivered = [];
        $invalid = [];

        foreach (array_chunk($tokens, self::BATCH) as $chunk) {
            $report = $this->messaging()->sendMulticast(CloudMessage::fromArray($message), $chunk);

            foreach ($report->successes()->getItems() as $item) {
                $delivered[] = $item->target()->value();
            }
            $invalid = [...$invalid, ...$report->invalidTokens(), ...$report->unknownTokens()];
        }

        return new FcmSendResult($delivered, array_values(array_unique($invalid)));
    }

    /**
     * Tạo LƯỜI, trong send(): file service account sai/thiếu thì lỗi ném ra ở đây
     * và FcmTransport bắt + ghi log. Tạo trong container binding thì lỗi nổ lúc
     * resolve PushChannel → mọi notification (kể cả Web Push, kể cả request đặt
     * xe chạy notify đồng bộ) sập theo.
     */
    private function messaging(): Messaging
    {
        return $this->messaging ??= (new Factory())->withServiceAccount($this->credentials)->createMessaging();
    }
}
