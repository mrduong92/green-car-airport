<?php

namespace App\Services;

use App\Models\DriverProfile;
use App\Models\SepayWebhookEvent;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\DriverTopUpCompletedNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SepayWebhookService
{
    /**
     * Xử lý 1 webhook event từ Sepay.
     * Idempotent theo `sepay_id`. Luôn trả về SepayWebhookEvent (mới hoặc đã tồn tại).
     */
    public function process(array $payload): SepayWebhookEvent
    {
        $sepayId = (int) ($payload['id'] ?? 0);

        // Idempotency: nếu đã xử lý sepay_id này trước đó, trả về luôn
        $existing = SepayWebhookEvent::where('sepay_id', $sepayId)->first();
        if ($existing) {
            return $existing;
        }

        $transferType = $payload['transferType'] ?? 'in';
        $amount       = (int) ($payload['transferAmount'] ?? 0);
        $code         = trim((string) ($payload['code'] ?? ''));

        // Fallback: extract GCA\d{6} từ content nếu Sepay chưa gửi field code
        if ($code === '') {
            $content = (string) ($payload['content'] ?? '');
            if (preg_match('/GCA\d{6}/', $content, $m)) {
                $code = $m[0];
            }
        }

        $base = [
            'sepay_id'         => $sepayId,
            'gateway'          => $payload['gateway'] ?? null,
            'account_number'   => $payload['accountNumber'] ?? null,
            'sub_account'      => $payload['subAccount'] ?? null,
            'code'             => $code !== '' ? $code : null,
            'content'          => $payload['content'] ?? null,
            'transfer_type'    => in_array($transferType, ['in', 'out'], true) ? $transferType : 'in',
            'description'      => $payload['description'] ?? null,
            'amount'           => max(0, $amount),
            'accumulated'      => isset($payload['accumulated']) ? (int) $payload['accumulated'] : null,
            'reference_code'   => $payload['referenceCode'] ?? null,
            'transaction_date' => $payload['transactionDate'] ?? null,
            'raw_payload'      => $payload,
        ];

        // Feature flag: auto top-up tắt → ghi nhận sự kiện nhưng không cộng điểm
        if (! config('features.auto_topup')) {
            return SepayWebhookEvent::create([...$base, 'status' => 'ignored']);
        }

        // Trường hợp 1: không phải tiền vào → ignored
        if ($base['transfer_type'] !== 'in') {
            return SepayWebhookEvent::create([...$base, 'status' => 'ignored']);
        }

        // Trường hợp 2: < 1.000đ → ignored (không cộng được điểm)
        if ($amount < 1000) {
            return SepayWebhookEvent::create([...$base, 'status' => 'ignored']);
        }

        // Trường hợp 3: không khớp driver → unmatched
        $driver = $this->findDriverByCode($code);
        if (! $driver) {
            return SepayWebhookEvent::create([...$base, 'status' => 'unmatched']);
        }

        // Trường hợp 4: khớp → cộng điểm trong transaction
        $points = intdiv($amount, 1000);

        return DB::transaction(function () use ($driver, $points, $amount, $base, $payload) {
            $wallet = Wallet::firstOrCreate(['user_id' => $driver->id], ['points' => 0]);

            $gateway = $base['gateway'] ?? 'CK';
            $ref     = $base['reference_code'] ? " · Ref {$base['reference_code']}" : '';

            $txn = WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => null,
                'type'        => 'topup',
                'description' => "Nạp điểm qua {$gateway}{$ref}",
                'points'      => $points,
            ]);

            $wallet->increment('points', $points);

            $event = SepayWebhookEvent::create([
                ...$base,
                'status'                => 'processed',
                'matched_user_id'       => $driver->id,
                'wallet_transaction_id' => $txn->id,
            ]);

            try {
                $driver->notify(new DriverTopUpCompletedNotification($points, $amount, $base['gateway']));
            } catch (\Throwable $e) {
                Log::warning('Top-up notification failed: ' . $e->getMessage());
            }

            return $event;
        });
    }

    private function findDriverByCode(string $code): ?User
    {
        if ($code === '') {
            return null;
        }

        $profile = DriverProfile::where('payment_code', $code)->first();

        return $profile?->user;
    }
}
