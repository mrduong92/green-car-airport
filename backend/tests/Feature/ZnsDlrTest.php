<?php

namespace Tests\Feature;

use App\Models\Otp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ZnsDlrTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'test-dlr-secret-token';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.southtelecom_zns.dlr_token' => $this->token]);
    }

    private function makeOtp(string $clientReqId = 'uuid-abc-123'): Otp
    {
        return Otp::create([
            'phone'           => '0901234567',
            'code'            => '123456',
            'expires_at'      => now()->addMinutes(5),
            'client_req_id'   => $clientReqId,
            'delivery_status' => 'pending',
        ]);
    }

    public function test_dlr_with_wrong_token_returns_403(): void
    {
        $this->get('/api/zns/dlr?token=wrongtoken&smsid=uuid-abc-123&status=1')
            ->assertStatus(403);
    }

    public function test_dlr_with_status_1_marks_otp_as_delivered(): void
    {
        $this->makeOtp();

        $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1&deliveredts=1700000000")
            ->assertStatus(200)
            ->assertSee('OK');

        $this->assertDatabaseHas('otps', [
            'client_req_id'   => 'uuid-abc-123',
            'delivery_status' => 'delivered',
        ]);
        $this->assertNotNull(Otp::where('client_req_id', 'uuid-abc-123')->value('delivered_at'));
    }

    public function test_dlr_with_status_0_marks_otp_as_failed(): void
    {
        $this->makeOtp();

        $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=0&otterrorcode=53")
            ->assertStatus(200);

        $this->assertDatabaseHas('otps', [
            'client_req_id'   => 'uuid-abc-123',
            'delivery_status' => 'failed',
        ]);
    }

    public function test_dlr_returns_200_even_when_otp_not_found(): void
    {
        $this->get("/api/zns/dlr?token={$this->token}&smsid=nonexistent-uuid&status=1")
            ->assertStatus(200)
            ->assertSee('OK');
    }

    public function test_dlr_returns_403_when_token_not_configured(): void
    {
        config(['services.southtelecom_zns.dlr_token' => null]);

        $this->get('/api/zns/dlr?smsid=uuid-abc-123&status=1')
            ->assertStatus(403);
    }

    public function test_dlr_can_be_called_multiple_times_for_same_otp(): void
    {
        $this->makeOtp();

        $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1")
            ->assertStatus(200);

        $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1")
            ->assertStatus(200);

        $this->assertDatabaseHas('otps', [
            'client_req_id'   => 'uuid-abc-123',
            'delivery_status' => 'delivered',
        ]);
    }
}
