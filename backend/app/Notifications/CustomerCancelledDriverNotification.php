<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class CustomerCancelledDriverNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Khách đã huỷ chuyến',
            'body'  => "Khách huỷ cuốc #{$this->booking->id}. Phí app đã trừ không hoàn.",
            'data'  => ['action' => 'view_trip', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Khách đã huỷ chuyến',
            'body'       => "Khách huỷ cuốc #{$this->booking->id}. Phí app đã trừ không hoàn.",
            'action'     => 'view_trip',
            'booking_id' => $this->booking->id,
        ];
    }
}
