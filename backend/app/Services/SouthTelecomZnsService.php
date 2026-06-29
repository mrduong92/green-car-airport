<?php

namespace App\Services;

use App\Services\Zns\ZnsSender;
use App\Services\Zns\ZnsSendResult;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SouthTelecomZnsService implements ZnsSender
{
    public function send(string $phone, string $code): ZnsSendResult
    {
        $clientReqId = Str::uuid()->toString();

        $response = Http::withHeaders($this->headers())
            ->post(config('services.southtelecom_zns.base_url') . '/sendZNS', [
                'from'          => config('services.southtelecom_zns.from'),
                'to'            => $this->toInternational($phone),
                'template_id'   => config('services.southtelecom_zns.template_id'),
                'template_data' => ['otp' => $code],
                'client_req_id' => $clientReqId,
                'dlr'           => 1,
            ]);

        $body = $response->json();

        if (($body['status'] ?? 0) !== 1) {
            Log::error('SouthTelecom ZNS send failed', [
                'phone'       => $phone,
                'errorcode'   => $body['errorcode'] ?? null,
                'description' => $body['description'] ?? null,
            ]);

            return new ZnsSendResult(
                success: false,
                clientReqId: $clientReqId,
                error: $body['description'] ?? 'Lỗi không xác định',
            );
        }

        Log::info('SouthTelecom ZNS OTP sent', [
            'phone'       => $phone,
            'tracking_id' => $body['tracking_id'],
        ]);

        return new ZnsSendResult(
            success: true,
            clientReqId: $clientReqId,
            trackingId: $body['tracking_id'],
        );
    }

    public function getBalance(): ?int
    {
        $response = Http::withHeaders($this->headers())
            ->get(config('services.southtelecom_zns.base_url') . '/getBalance');

        $body = $response->json();

        if (($body['status'] ?? 0) !== 1) {
            Log::error('SouthTelecom ZNS getBalance failed', [
                'errorcode'   => $body['errorcode'] ?? null,
                'description' => $body['description'] ?? null,
            ]);

            return null;
        }

        return (int) $body['balance'];
    }

    private function headers(): array
    {
        return [
            'Authorization' => 'Basic ' . base64_encode(
                config('services.southtelecom_zns.user') . ':' . config('services.southtelecom_zns.password')
            ),
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
        ];
    }

    private function toInternational(string $phone): string
    {
        return '84' . ltrim($phone, '0');
    }
}
