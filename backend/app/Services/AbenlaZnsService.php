<?php

namespace App\Services;

use App\Services\Zns\ZnsSender;
use App\Services\Zns\ZnsSendResult;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AbenlaZnsService implements ZnsSender
{
    public function send(string $phone, string $code): ZnsSendResult
    {
        $clientReqId = Str::uuid()->toString();

        $response = Http::get(config('services.abenla_zns.base_url') . '/SendOTP', [
            'loginName'     => config('services.abenla_zns.login_name'),
            'sign'          => config('services.abenla_zns.sign'),
            'serviceTypeId' => config('services.abenla_zns.service_type_id'),
            'phoneNumber'   => $phone,
            'message'       => $code,
            'detectCode'    => true,
            'brandName'     => config('services.abenla_zns.brand_name'),
        ]);

        $body = $response->json();

        if (($body['Code'] ?? 0) !== 203) {
            Log::error('Abenla ZNS send failed', [
                'phone'   => $phone,
                'code'    => $body['Code'] ?? null,
                'message' => $body['Message'] ?? null,
            ]);

            return new ZnsSendResult(
                success: false,
                clientReqId: $clientReqId,
                error: $body['Message'] ?? 'Lỗi không xác định',
            );
        }

        Log::info('Abenla ZNS OTP sent', ['phone' => $phone]);

        return new ZnsSendResult(
            success: true,
            clientReqId: $clientReqId,
        );
    }

    public function getBalance(): ?int
    {
        return null;
    }
}
