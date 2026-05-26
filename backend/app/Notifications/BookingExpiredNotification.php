<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class BookingExpiredNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Không tìm được tài xế',
            'body'  => "Chuyến #{$this->booking->id} đã bị huỷ do không có tài xế",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Không tìm được tài xế',
            'body'       => "Chuyến #{$this->booking->id} đã bị huỷ do không có tài xế",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
