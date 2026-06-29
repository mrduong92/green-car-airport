<?php

namespace Tests\Feature;

use App\Models\Otp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class OtpZnsFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_otps_table_has_zns_columns(): void
    {
        $this->assertTrue(Schema::hasColumn('otps', 'client_req_id'));
        $this->assertTrue(Schema::hasColumn('otps', 'tracking_id'));
        $this->assertTrue(Schema::hasColumn('otps', 'delivery_status'));
        $this->assertTrue(Schema::hasColumn('otps', 'delivered_at'));
    }

    public function test_otp_model_accepts_zns_fields_as_fillable(): void
    {
        $otp = Otp::create([
            'phone'           => '0901234567',
            'code'            => '123456',
            'expires_at'      => now()->addMinutes(5),
            'client_req_id'   => 'uuid-test-123',
            'tracking_id'     => 'TRACK-XYZ',
            'delivery_status' => 'pending',
        ]);

        $this->assertSame('uuid-test-123', $otp->client_req_id);
        $this->assertSame('TRACK-XYZ', $otp->tracking_id);
        $this->assertSame('pending', $otp->delivery_status);
    }

    public function test_delivered_at_is_cast_to_datetime(): void
    {
        $otp = Otp::create([
            'phone'        => '0901234567',
            'code'         => '000000',
            'expires_at'   => now()->addMinutes(5),
            'delivered_at' => '2026-06-29 10:00:00',
        ]);

        $this->assertInstanceOf(\Illuminate\Support\Carbon::class, $otp->delivered_at);
    }
}
