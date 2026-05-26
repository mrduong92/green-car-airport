<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class DriverTopUpCompletedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private int $points,
        private int $amountVnd,
        private ?string $gateway = null,
    ) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toWebPush($notifiable, $notification): array
    {
        $amountFmt = number_format($this->amountVnd, 0, ',', '.');
        $via       = $this->gateway ? " qua {$this->gateway}" : '';

        return [
            'title' => 'Nạp điểm thành công',
            'body'  => "+{$this->points} điểm vào ví — {$amountFmt}đ{$via}",
            'data'  => ['action' => 'view_wallet'],
        ];
    }

    public function toArray($notifiable): array
    {
        $amountFmt = number_format($this->amountVnd, 0, ',', '.');
        $via       = $this->gateway ? " qua {$this->gateway}" : '';

        return [
            'title'  => 'Nạp điểm thành công',
            'body'   => "+{$this->points} điểm vào ví — {$amountFmt}đ{$via}",
            'action' => 'view_wallet',
            'points' => $this->points,
            'amount_vnd' => $this->amountVnd,
        ];
    }
}
