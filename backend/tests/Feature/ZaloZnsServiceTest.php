<?php

namespace Tests\Feature;

use App\Services\ZaloZnsService;
use App\Services\Zns\ZnsSender;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class ZaloZnsServiceTest extends TestCase
{
    private ZaloZnsService $service;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.zalo_zns.app_id'       => 'test_app_id',
            'services.zalo_zns.app_secret'    => 'test_secret',
            'services.zalo_zns.refresh_token' => 'test_refresh',
            'services.zalo_zns.template_id'   => '99999',
        ]);
        Cache::forget('zalo_zns_token');
        $this->service = app(ZaloZnsService::class);
    }

    public function test_implements_zns_sender_interface(): void
    {
        $this->assertInstanceOf(ZnsSender::class, $this->service);
    }

    public function test_send_returns_success_result_when_zalo_returns_error_0(): void
    {
        Http::fake([
            '*/access_token'      => Http::response(['access_token' => 'fake_token']),
            '*/message/template'  => Http::response(['error' => 0, 'message' => 'Success']),
        ]);

        $result = $this->service->send('0901234567', '123456');

        $this->assertTrue($result->success);
        $this->assertNotNull($result->clientReqId);
        $this->assertNull($result->error);
    }

    public function test_send_returns_failure_when_zalo_returns_non_zero_error(): void
    {
        Http::fake([
            '*/access_token'     => Http::response(['access_token' => 'fake_token']),
            '*/message/template' => Http::response(['error' => -216, 'message' => 'Template not found']),
        ]);

        $result = $this->service->send('0901234567', '123456');

        $this->assertFalse($result->success);
        $this->assertNotNull($result->clientReqId);
    }

    public function test_send_returns_failure_when_token_cannot_be_obtained(): void
    {
        Http::fake([
            '*/access_token' => Http::response([]),
        ]);

        $result = $this->service->send('0901234567', '123456');

        $this->assertFalse($result->success);
    }

    public function test_get_balance_returns_null(): void
    {
        $this->assertNull($this->service->getBalance());
    }

    public function test_zalo_provider_binding_resolves_correctly(): void
    {
        config(['services.zns.provider' => 'zalo']);
        $sender = app(ZnsSender::class);
        $this->assertInstanceOf(ZaloZnsService::class, $sender);
    }
}
