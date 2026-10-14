<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class RewardPointsEarnedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private Booking $booking, private int $points, private string $kind) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    private function body(): string
    {
        return $this->kind === 'commission'
            ? "+{$this->points} điểm hoa hồng từ chuyến của bạn bè bạn giới thiệu"
            : "+{$this->points} điểm hoàn từ chuyến #{$this->booking->id}";
    }

    public function toWebPush($notifiable, $notification): array
    {
        return ['title' => 'Bạn nhận điểm thưởng', 'body' => $this->body(), 'data' => ['action' => 'open_url', 'url' => '/customer/reward-wallet']];
    }

    public function toArray($notifiable): array
    {
        return ['title' => 'Bạn nhận điểm thưởng', 'body' => $this->body(), 'action' => 'open_url', 'url' => '/customer/reward-wallet', 'points' => $this->points, 'kind' => $this->kind, 'booking_id' => $this->booking->id];
    }
}
