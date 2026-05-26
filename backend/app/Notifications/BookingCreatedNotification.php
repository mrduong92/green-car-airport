<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class BookingCreatedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Đặt xe thành công',
            'body'  => "Đang tìm tài xế cho chuyến #{$this->booking->id}...",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Đặt xe thành công',
            'body'       => "Đang tìm tài xế cho chuyến #{$this->booking->id}...",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
