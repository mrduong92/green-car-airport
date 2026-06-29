<?php

namespace App\Services;

use App\Services\Zns\ZnsSender;
use App\Services\Zns\ZnsSendResult;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ZaloZnsService implements ZnsSender
{
    private string $oauthUrl = 'https://oauth.zaloapp.com/v4/access_token';
    private string $znsUrl   = 'https://business.openapi.zalo.me/message/template';

    public function send(string $phone, string $code): ZnsSendResult
    {
        $clientReqId = Str::uuid()->toString();
        $token = $this->getAccessToken();

        if (! $token) {
            return new ZnsSendResult(
                success: false,
                clientReqId: $clientReqId,
                error: 'Không lấy được access token',
            );
        }

        $response = Http::withHeaders(['access_token' => $token])
            ->asJson()
            ->post($this->znsUrl, [
                'phone'         => $this->toInternational($phone),
                'template_id'   => config('services.zalo_zns.template_id'),
                'template_data' => ['otp' => $code],
            ]);

        $body = $response->json();

        if (($body['error'] ?? -1) !== 0) {
            Log::error('Zalo ZNS error', ['phone' => $phone, 'response' => $body]);

            return new ZnsSendResult(
                success: false,
                clientReqId: $clientReqId,
                error: $body['message'] ?? 'Lỗi không xác định',
            );
        }

        Log::info('Zalo ZNS OTP sent', ['phone' => $phone]);

        return new ZnsSendResult(
            success: true,
            clientReqId: $clientReqId,
        );
    }

    public function getBalance(): ?int
    {
        return null;
    }

    private function getAccessToken(): ?string
    {
        $cached = Cache::get('zalo_zns_token');
        if ($cached) {
            return $cached;
        }

        $token = $this->refreshAccessToken();
        if ($token) {
            Cache::put('zalo_zns_token', $token, now()->addMinutes(50));
        }

        return $token;
    }

    private function refreshAccessToken(): ?string
    {
        $response = Http::asForm()->post($this->oauthUrl, [
            'grant_type'    => 'refresh_token',
            'app_id'        => config('services.zalo_zns.app_id'),
            'secret_key'    => config('services.zalo_zns.app_secret'),
            'refresh_token' => config('services.zalo_zns.refresh_token'),
        ]);

        $body = $response->json();

        if (empty($body['access_token'])) {
            Log::error('Zalo ZNS token refresh failed', ['response' => $body]);
            return null;
        }

        // Zalo có thể trả refresh_token mới — lưu lại vào .env để không hết hạn
        if (! empty($body['refresh_token'])) {
            $this->persistRefreshToken($body['refresh_token']);
        }

        return $body['access_token'];
    }

    private function persistRefreshToken(string $newToken): void
    {
        $envPath = base_path('.env');

        if (! file_exists($envPath)) {
            return;
        }

        $content = file_get_contents($envPath);
        $updated = preg_replace(
            '/^ZALO_REFRESH_TOKEN=.*/m',
            'ZALO_REFRESH_TOKEN=' . $newToken,
            $content,
        );

        file_put_contents($envPath, $updated);
    }

    private function toInternational(string $phone): string
    {
        return '84' . ltrim($phone, '0');
    }
}
