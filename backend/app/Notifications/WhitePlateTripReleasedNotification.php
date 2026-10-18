<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

// Gửi tài xế xe biển trắng: cuốc đã nhận bị trả về sàn, phí app đã hoàn.
class WhitePlateTripReleasedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private Booking $booking) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    private function body(): string
    {
        return "Cuốc #{$this->booking->id} đã được chuyển cho tài xế khác và hoàn phí app: xe biển trắng không được nhận cuốc chở khách. Liên hệ admin khi xe đã chuyển sang biển vàng.";
    }

    public function toWebPush($notifiable, $notification): array
    {
        return [
            'title' => 'Cuốc đã được chuyển đi',
            'body' => $this->body(),
            'data' => ['action' => 'view_trips'],
        ];
    }

    public function toArray($notifiable): array
    {
        return [
            'title' => 'Cuốc đã được chuyển đi',
            'body' => $this->body(),
            'action' => 'view_trips',
            'booking_id' => $this->booking->id,
        ];
    }
}
