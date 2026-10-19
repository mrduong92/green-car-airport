<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\AppSetting;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class TripCompletedDriverNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private Booking $booking) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    public function toWebPush($notifiable, $notification): array
    {
        $appFee = (int) round($this->booking->basePrice() * AppSetting::appFeeRate());
        $netEarning = number_format($this->booking->basePrice() - $appFee, 0, ',', '.');

        return [
            'title' => 'Hoàn thành chuyến!',
            'body' => "Bạn nhận {$netEarning}đ từ cuốc #{$this->booking->id}",
            'data' => ['action' => 'view_wallet'],
        ];
    }

    public function toArray($notifiable): array
    {
        $appFee = (int) round($this->booking->basePrice() * AppSetting::appFeeRate());
        $netEarning = $this->booking->basePrice() - $appFee;

        return [
            'title' => 'Hoàn thành chuyến!',
            'body' => 'Bạn nhận '.number_format($netEarning, 0, ',', '.')."đ từ cuốc #{$this->booking->id}",
            'action' => 'view_wallet',
            'booking_id' => $this->booking->id,
        ];
    }
}
