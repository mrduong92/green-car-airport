<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

// Gỡ cuốc VIP: cuốc khách đặt xe cá nhân (biển trắng) chuyển sang xe thường, giá giữ nguyên.
class BookingMovedToStandardCarNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private Booking $booking, private bool $released) {}

    public function via($notifiable): array
    {
        return ['database', WebPushChannel::class];
    }

    private function body(): string
    {
        $base = "Chuyến #{$this->booking->id} đã chuyển sang xe biển vàng, giá giữ nguyên.";

        return $this->released ? $base.' Đang tìm tài xế mới cho bạn...' : $base;
    }

    public function toWebPush($notifiable, $notification): array
    {
        return [
            'title' => 'Chuyến của bạn đổi sang xe thường',
            'body' => $this->body(),
            'data' => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }

    public function toArray($notifiable): array
    {
        return [
            'title' => 'Chuyến của bạn đổi sang xe thường',
            'body' => $this->body(),
            'action' => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
