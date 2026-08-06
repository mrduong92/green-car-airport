<?php

namespace Tests\Feature;

use App\Services\AbenlaZnsService;
use App\Services\Zns\ZnsSender;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AbenlaZnsServiceTest extends TestCase
{
    private AbenlaZnsService $service;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.abenla_zns.base_url'        => 'https://api.abenla.com/api',
            'services.abenla_zns.login_name'      => 'ABHP77G',
            'services.abenla_zns.sign'            => 'testhash',
            'services.abenla_zns.service_type_id' => 537,
            'services.abenla_zns.brand_name'      => 'ZOTP',
        ]);
        $this->service = app(AbenlaZnsService::class);
    }

    public function test_implements_zns_sender_interface(): void
    {
        $this->assertInstanceOf(ZnsSender::class, $this->service);
    }

    public function test_send_returns_success_when_api_returns_code_203(): void
    {
        Http::fake([
            '*/SendOTP*' => Http::response([
                'SmsPerMessage' => 1,
                'Code'          => 203,
                'Message'       => 'Success',
            ]),
        ]);

        $result = $this->service->send('0868968312', '123456');

        $this->assertTrue($result->success);
        $this->assertNotNull($result->clientReqId);
        $this->assertNull($result->error);
    }

    public function test_send_returns_failure_when_api_returns_non_203_code(): void
    {
        Http::fake([
            '*/SendOTP*' => Http::response([
                'SmsPerMessage' => 0,
                'Code'          => 400,
                'Message'       => 'Invalid phone number',
            ]),
        ]);

        $result = $this->service->send('0868968312', '123456');

        $this->assertFalse($result->success);
        $this->assertSame('Invalid phone number', $result->error);
        $this->assertNotNull($result->clientReqId);
    }

    public function test_send_passes_correct_params_to_api(): void
    {
        Http::fake([
            '*/SendOTP*' => Http::response(['Code' => 203, 'Message' => 'Success']),
        ]);

        $this->service->send('0868968312', '999888');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'loginName=ABHP77G')
                && str_contains($request->url(), 'phoneNumber=0868968312')
                && str_contains($request->url(), 'message=999888')
                && str_contains($request->url(), 'detectCode=1')
                && str_contains($request->url(), 'brandName=ZOTP');
        });
    }

    public function test_abenla_provider_binding_resolves_correctly(): void
    {
        config(['services.zns.provider' => 'abenla']);
        $sender = app(ZnsSender::class);
        $this->assertInstanceOf(AbenlaZnsService::class, $sender);
    }

    /**
     * Abenla trả Code=106 cho GetBalance thành công (khác 203 của SendOTP).
     * Số dư về dưới dạng float ("Balance":24890.0000) nên phải ép sang int.
     */
    public function test_get_balance_returns_int_when_api_returns_code_106(): void
    {
        Http::fake([
            '*/GetBalance*' => Http::response([
                'Balance' => 24890.0000,
                'Code'    => 106,
                'Message' => 'Success',
            ]),
        ]);

        $this->assertSame(24890, $this->service->getBalance());
    }

    public function test_get_balance_returns_null_when_ip_not_whitelisted(): void
    {
        // Code 104 CanNotAccess — IP server chưa được whitelist. Payload vẫn
        // kèm "Balance":0.0, KHÔNG được hiểu nhầm thành "hết tiền".
        Http::fake([
            '*/GetBalance*' => Http::response([
                'Balance' => 0.0,
                'Code'    => 104,
                'Message' => 'CanNotAccess',
            ]),
        ]);

        $this->assertNull($this->service->getBalance());
    }

    public function test_get_balance_returns_null_on_http_error(): void
    {
        Http::fake(['*/GetBalance*' => Http::response('', 500)]);

        $this->assertNull($this->service->getBalance());
    }
}
