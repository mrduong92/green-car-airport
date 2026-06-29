<?php

namespace Tests\Feature;

use App\Models\Otp;
use App\Models\User;
use App\Services\Zns\ZnsSender;
use App\Services\Zns\ZnsSendResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OtpSendTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Bind a real fake ZnsSender into the container.
     *
     * Mockery cannot mock a method returning the readonly ZnsSendResult class
     * on PHP 8.4 (it would have to extend a readonly class), so we use a
     * hand-written fake that records calls instead.
     */
    private function fakeSender(bool $success = true, ?string $error = null): object
    {
        $fake = new class implements ZnsSender {
            public int $calls = 0;
            public bool $success = true;
            public ?string $error = null;

            public function send(string $phone, string $code): ZnsSendResult
            {
                $this->calls++;

                return new ZnsSendResult(
                    success: $this->success,
                    clientReqId: $this->success ? 'uuid-test-1234' : null,
                    trackingId: $this->success ? 'TRACK-XYZ' : null,
                    error: $this->error,
                );
            }

            public function getBalance(): ?int
            {
                return null;
            }
        };

        $fake->success = $success;
        $fake->error = $error;

        $this->app->instance(ZnsSender::class, $fake);

        return $fake;
    }

    public function test_send_in_local_env_does_not_call_zns_and_returns_200(): void
    {
        app()->detectEnvironment(fn () => 'local');
        config(['services.zns.force_send' => false]);

        $fake = $this->fakeSender();

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertOk()
            ->assertJson(['message' => 'OTP đã được gửi.']);

        $this->assertSame(0, $fake->calls);

        app()->detectEnvironment(fn () => 'testing');
    }

    public function test_send_calls_zns_and_saves_tracking_data_on_success(): void
    {
        $fake = $this->fakeSender(success: true);

        $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
            ->assertOk()
            ->assertJson(['message' => 'OTP đã được gửi.']);

        $this->assertSame(1, $fake->calls);
        $this->assertDatabaseHas('otps', [
            'phone'           => '0901234567',
            'client_req_id'   => 'uuid-test-1234',
            'tracking_id'     => 'TRACK-XYZ',
            'delivery_status' => 'pending',
        ]);
    }

    public function test_send_returns_503_when_zns_fails(): void
    {
        $this->fakeSender(success: false, error: 'quota exceeded');

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

        $this->fakeSender(success: true);

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

    public function test_send_register_purpose_rejects_existing_phone(): void
    {
        User::create(['phone' => '0901234567', 'role' => 'customer']);

        $fake = $this->fakeSender();

        $this->postJson('/api/auth/otp/send', [
            'phone'   => '0901234567',
            'purpose' => 'register',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Số điện thoại đã được đăng ký.']);

        $this->assertSame(0, $fake->calls);
        $this->assertDatabaseMissing('otps', ['phone' => '0901234567']);
    }

    public function test_send_reset_purpose_rejects_unknown_phone(): void
    {
        $fake = $this->fakeSender();

        $this->postJson('/api/auth/otp/send', [
            'phone'   => '0909999999',
            'purpose' => 'reset',
        ])
            ->assertStatus(422)
            ->assertJson(['message' => 'Số điện thoại chưa đăng ký.']);

        $this->assertSame(0, $fake->calls);
        $this->assertDatabaseMissing('otps', ['phone' => '0909999999']);
    }

    public function test_send_register_purpose_succeeds_for_new_phone(): void
    {
        $fake = $this->fakeSender(success: true);

        $this->postJson('/api/auth/otp/send', [
            'phone'   => '0908888888',
            'purpose' => 'register',
        ])
            ->assertOk()
            ->assertJson(['message' => 'OTP đã được gửi.']);

        $this->assertSame(1, $fake->calls);
    }
}
