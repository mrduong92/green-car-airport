<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloBotSignatureTest extends TestCase
{
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        Route::post('/api/_test/zalo', fn () => ['ok' => true])->middleware('zalo.bot');
    }

    public function test_valid_signature_passes(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'])->assertOk()->assertJson(['ok' => true]);
    }

    public function test_known_vector_shared_with_node_service_passes(): void
    {
        $this->travelTo(Carbon::createFromTimestamp(1700000000));
        $body = '{"bot_id":"bot-1","messages":[{"content":"4h30 Tiễn Hoài Đức"}]}';

        $this->call('POST', '/api/_test/zalo', [], [], [], [
            'CONTENT_TYPE'          => 'application/json',
            'HTTP_ACCEPT'           => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => '1700000000',
            'HTTP_X_ZALO_SIGNATURE' => '1b79231e73c3fcd9383c96d959e1b1fcd6376675df5231d2ea3e66e943aeb4b7',
        ], $body)->assertOk();
    }

    public function test_wrong_secret_is_rejected(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], secret: 'other')->assertStatus(401);
    }

    public function test_tampered_body_is_rejected(): void
    {
        $ts = (string) now()->timestamp;
        $sig = hash_hmac('sha256', $ts.'.{"bot_id":"bot-1"}', 'test-secret');

        $this->call('POST', '/api/_test/zalo', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => $ts, 'HTTP_X_ZALO_SIGNATURE' => $sig,
        ], '{"bot_id":"bot-2"}')->assertStatus(401);
    }

    public function test_stale_timestamp_is_rejected(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], timestamp: now()->timestamp - 301)->assertStatus(401);
    }

    public function test_empty_secret_rejects_everything(): void
    {
        config(['zalo.bot_secret' => '']);

        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], secret: '')->assertStatus(401);
    }

    public function test_kill_switch_returns_503(): void
    {
        config(['zalo.enabled' => false]);

        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'])->assertStatus(503);
    }
}
