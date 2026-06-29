<?php

namespace Tests\Feature;

use App\Services\SouthTelecomZnsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class SouthTelecomZnsServiceTest extends TestCase
{
    private SouthTelecomZnsService $service;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.southtelecom_zns.base_url'    => 'https://api-04.worldsms.vn/apidebit',
            'services.southtelecom_zns.user'        => 'testuser',
            'services.southtelecom_zns.password'    => 'testpass',
            'services.southtelecom_zns.from'        => 'TEST_OA_ID',
            'services.southtelecom_zns.template_id' => '12345',
        ]);
        $this->service = app(SouthTelecomZnsService::class);
    }

    public function test_send_returns_success_result_when_api_returns_status_1(): void
    {
        Http::fake([
            '*/sendZNS' => Http::response([
                'status'      => 1,
                'tracking_id' => 'TRACK-ABC-123',
            ]),
        ]);

        $result = $this->service->send('0901234567', '123456');

        $this->assertTrue($result->success);
        $this->assertSame('TRACK-ABC-123', $result->trackingId);
        $this->assertNotNull($result->clientReqId);
        $this->assertNull($result->error);
    }

    public function test_send_returns_failure_result_when_api_returns_status_0(): void
    {
        Http::fake([
            '*/sendZNS' => Http::response([
                'status'      => 0,
                'errorcode'   => 82,
                'description' => 'Account over quota',
            ]),
        ]);

        $result = $this->service->send('0901234567', '123456');

        $this->assertFalse($result->success);
        $this->assertSame('Account over quota', $result->error);
        $this->assertNotNull($result->clientReqId);
        $this->assertNull($result->trackingId);
    }

    public function test_send_converts_phone_to_international_format(): void
    {
        Http::fake([
            '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
        ]);

        $this->service->send('0901234567', '000000');

        Http::assertSent(function ($request) {
            return $request['to'] === '84901234567';
        });
    }

    public function test_send_includes_dlr_flag_and_client_req_id(): void
    {
        Http::fake([
            '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
        ]);

        $this->service->send('0901234567', '000000');

        Http::assertSent(function ($request) {
            return $request['dlr'] === 1
                && ! empty($request['client_req_id'])
                && $request['template_data'] === ['otp' => '000000'];
        });
    }

    public function test_get_balance_returns_integer_on_success(): void
    {
        Http::fake([
            '*/getBalance' => Http::response([
                'status'      => 1,
                'errorcode'   => 0,
                'balance'     => 547050,
                'description' => 'Get Balance Success',
            ]),
        ]);

        $balance = $this->service->getBalance();

        $this->assertSame(547050, $balance);
    }

    public function test_get_balance_returns_null_on_failure(): void
    {
        Http::fake([
            '*/getBalance' => Http::response([
                'status'      => 0,
                'errorcode'   => 40,
                'description' => 'Unauthorized',
            ]),
        ]);

        $balance = $this->service->getBalance();

        $this->assertNull($balance);
    }

    public function test_send_uses_basic_auth_header(): void
    {
        Http::fake([
            '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
        ]);

        $this->service->send('0901234567', '000000');

        Http::assertSent(function ($request) {
            $expected = 'Basic ' . base64_encode('testuser:testpass');
            return $request->header('Authorization')[0] === $expected;
        });
    }
}
