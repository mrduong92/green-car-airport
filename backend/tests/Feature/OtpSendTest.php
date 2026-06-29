<?php

namespace Tests\Feature;

use App\Models\Otp;
use App\Services\Zns\ZnsSender;
use App\Services\Zns\ZnsSendResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OtpSendTest extends TestCase
{
    use RefreshDatabase;

    public function test_send_in_local_env_does_not_call_zns_and_returns_200(): void
    {
        app()->detectEnvironment(fn () => 'local');

        $mock = $this->mock(ZnsSender::class);
        $mock->shouldNotReceive('send');

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertOk()
            ->assertJson(['message' => 'OTP đã được gửi.']);

        app()->detectEnvironment(fn () => 'testing');
    }

    public function test_send_calls_zns_and_saves_tracking_data_on_success(): void
    {
        $this->mock(ZnsSender::class)
            ->shouldReceive('send')
            ->once()
            ->with('0901234567', \Mockery::type('string'))
            ->andReturn(new ZnsSendResult(
                success: true,
                clientReqId: 'uuid-test-1234',
                trackingId: 'TRACK-XYZ',
            ));

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertOk()
            ->assertJson(['message' => 'OTP đã được gửi.']);

        $this->assertDatabaseHas('otps', [
            'phone'           => '0901234567',
            'client_req_id'   => 'uuid-test-1234',
            'tracking_id'     => 'TRACK-XYZ',
            'delivery_status' => 'pending',
        ]);
    }

    public function test_send_returns_503_when_zns_fails(): void
    {
        $this->mock(ZnsSender::class)
            ->shouldReceive('send')
            ->once()
            ->andReturn(new ZnsSendResult(success: false, error: 'quota exceeded'));

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertStatus(503)
            ->assertJson(['message' => 'Không thể gửi OTP. Vui lòng thử lại.']);
    }

    public function test_send_deletes_old_otp_before_creating_new(): void
    {
        Otp::create([
            'phone'      => '0901234567',
            'code'       => '111111',
            'expires_at' => now()->addMinutes(5),
        ]);

        $this->mock(ZnsSender::class)
            ->shouldReceive('send')
            ->once()
            ->andReturn(new ZnsSendResult(success: true, clientReqId: 'x', trackingId: 'y'));

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertOk();

        $this->assertDatabaseCount('otps', 1);
        $this->assertDatabaseMissing('otps', ['code' => '111111']);
    }

    public function test_send_requires_phone(): void
    {
        $this->postJson('/api/auth/otp/send', [])
            ->assertStatus(422);
    }
}
