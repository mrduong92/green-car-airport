<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class CustomerCancelledNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Đã huỷ chuyến',
            'body'  => "Chuyến #{$this->booking->id} đã được huỷ thành công",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Đã huỷ chuyến',
            'body'       => "Chuyến #{$this->booking->id} đã được huỷ thành công",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
