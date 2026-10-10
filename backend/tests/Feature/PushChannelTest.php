<?php
// backend/tests/Feature/PushChannelTest.php

namespace Tests\Feature;

use App\Channels\Push\FcmTransport;
use App\Channels\Push\WebPushTransport;
use App\Channels\PushChannel;
use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;
use Tests\TestCase;

class PushChannelTest extends TestCase
{
    use RefreshDatabase;

    private function notification(): Notification
    {
        return new class extends Notification {
            public function via($notifiable): array
            {
                return [PushChannel::class];
            }

            public function toPush($notifiable, $notification): array
            {
                return ['title' => 'T', 'body' => 'B', 'data' => ['action' => 'view_wallet']];
            }
        };
    }

    public function test_chia_token_cho_dung_transport(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/1', 'p256dh' => 'p', 'auth' => 'a']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'fcm-1', 'platform' => 'android']);

        $this->mock(WebPushTransport::class)->shouldReceive('send')->once()
            ->withArgs(fn (Collection $t, array $p) => $t->pluck('endpoint')->all() === ['https://push.example/1'] && $p['title'] === 'T');
        $this->mock(FcmTransport::class)->shouldReceive('send')->once()
            ->withArgs(fn (Collection $t, array $p) => $t->pluck('fcm_token')->all() === ['fcm-1']);

        $user->notify($this->notification());
    }

    public function test_chi_co_token_web_thi_khong_goi_fcm(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/2', 'p256dh' => 'p', 'auth' => 'a']);

        $this->mock(WebPushTransport::class)->shouldReceive('send')->once();
        $this->mock(FcmTransport::class)->shouldNotReceive('send');

        $user->notify($this->notification());
    }

    public function test_khong_co_toPush_thi_khong_lam_gi(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'fcm-2', 'platform' => 'android']);

        $this->mock(WebPushTransport::class)->shouldNotReceive('send');
        $this->mock(FcmTransport::class)->shouldNotReceive('send');

        (new PushChannel(app(WebPushTransport::class), app(FcmTransport::class)))
            ->send($user, new class extends Notification {});
    }
}
