<?php

namespace Tests\Concerns;

use Illuminate\Testing\TestResponse;

trait SignsZaloBotRequests
{
    // Ký đúng như service Node: HMAC-SHA256(secret, "{timestamp}.{raw body}").
    protected function zaloPost(string $uri, array $payload, ?int $timestamp = null, ?string $secret = null): TestResponse
    {
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $ts = (string) ($timestamp ?? now()->timestamp);
        $signature = hash_hmac('sha256', $ts.'.'.$body, $secret ?? (string) config('zalo.bot_secret'));

        return $this->call('POST', $uri, [], [], [], [
            'CONTENT_TYPE'          => 'application/json',
            'HTTP_ACCEPT'           => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => $ts,
            'HTTP_X_ZALO_SIGNATURE' => $signature,
        ], $body);
    }
}
