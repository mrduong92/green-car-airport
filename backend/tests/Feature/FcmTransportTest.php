<?php
// backend/tests/Feature/FcmTransportTest.php

namespace Tests\Feature;

use App\Channels\Push\FcmTransport;
use App\Models\DeviceToken;
use App\Models\User;
use App\Services\Fcm\FcmSender;
use App\Services\Fcm\FcmSendResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FcmTransportTest extends TestCase
{
    use RefreshDatabase;

    public function test_dich_payload_kenh_cuoc_moi(): void
    {
        $msg = FcmTransport::buildMessage([
            'title' => 'Có cuốc mới!',
            'body' => 'A → B',
            'data' => ['action' => 'view_trip', 'booking_id' => 42],
            'tag' => 'greenca-free-ride',
            'channel' => 'new_ride',
            'ttl' => 300,
        ]);

        $this->assertSame(['title' => 'Có cuốc mới!', 'body' => 'A → B'], $msg['notification']);
        $this->assertSame(['action' => 'view_trip', 'booking_id' => '42', 'channel' => 'new_ride'], $msg['data']);
        $this->assertSame('high', $msg['android']['priority']);
        $this->assertSame('300s', $msg['android']['ttl']);
        $this->assertSame('new_ride', $msg['android']['notification']['channel_id']);
        $this->assertSame('new_ride', $msg['android']['notification']['sound']);
        $this->assertSame('greenca-free-ride', $msg['android']['notification']['tag']);
    }

    public function test_mac_dinh_kenh_general_khong_ttl_khong_tag(): void
    {
        $msg = FcmTransport::buildMessage(['title' => 'T', 'body' => 'B', 'data' => ['action' => 'view_wallet']]);

        $this->assertSame('general', $msg['android']['notification']['channel_id']);
        $this->assertSame('default', $msg['android']['notification']['sound']);
        $this->assertArrayNotHasKey('tag', $msg['android']['notification']);
        $this->assertArrayNotHasKey('ttl', $msg['android']);
        $this->assertSame('general', $msg['data']['channel']);
    }

    public function test_data_null_bi_bo_va_moi_gia_tri_la_chuoi(): void
    {
        $msg = FcmTransport::buildMessage([
            'title' => 'T', 'body' => 'B',
            'data' => ['action' => 'view_wallet', 'booking_id' => null, 'amount' => 50, 'paid' => true],
        ]);

        $this->assertArrayNotHasKey('booking_id', $msg['data']);
        foreach ($msg['data'] as $value) {
            $this->assertIsString($value);
        }
        $this->assertSame('50', $msg['data']['amount']);
    }

    public function test_xoa_token_chet_cap_nhat_token_song(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'alive', 'platform' => 'android']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'dead', 'platform' => 'android']);

        $sender = new class implements FcmSender {
            public array $calls = [];

            public function send(array $tokens, array $message): FcmSendResult
            {
                $this->calls[] = $tokens;

                return new FcmSendResult(delivered: ['alive'], invalid: ['dead']);
            }
        };

        (new FcmTransport($sender))->send(DeviceToken::all(), ['title' => 'T', 'body' => 'B', 'data' => []]);

        $this->assertSame([['alive', 'dead']], $sender->calls);
        $this->assertDatabaseMissing('device_tokens', ['fcm_token' => 'dead']);
        $this->assertNotNull(DeviceToken::where('fcm_token', 'alive')->value('last_used_at'));
    }

    public function test_sender_nem_loi_thi_nuot_va_khong_xoa_gi(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 't', 'platform' => 'android']);

        $sender = new class implements FcmSender {
            public function send(array $tokens, array $message): FcmSendResult
            {
                throw new \RuntimeException('FCM down');
            }
        };

        (new FcmTransport($sender))->send(DeviceToken::all(), ['title' => 'T', 'body' => 'B', 'data' => []]);

        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 't']);
    }
}
