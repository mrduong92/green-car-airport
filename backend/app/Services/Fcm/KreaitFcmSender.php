<?php
// backend/app/Services/Fcm/KreaitFcmSender.php
namespace App\Services\Fcm;

use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Messaging\CloudMessage;

final class KreaitFcmSender implements FcmSender
{
    /** Giới hạn của FCM cho một lần multicast. */
    private const BATCH = 500;

    public function __construct(private Messaging $messaging) {}

    public function send(array $tokens, array $message): FcmSendResult
    {
        $delivered = [];
        $invalid = [];

        foreach (array_chunk($tokens, self::BATCH) as $chunk) {
            $report = $this->messaging->sendMulticast(CloudMessage::fromArray($message), $chunk);

            foreach ($report->successes()->getItems() as $item) {
                $delivered[] = $item->target()->value();
            }
            $invalid = [...$invalid, ...$report->invalidTokens(), ...$report->unknownTokens()];
        }

        return new FcmSendResult($delivered, array_values(array_unique($invalid)));
    }
}
