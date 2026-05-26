<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class TripStartedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Chuyến đi bắt đầu',
            'body'  => "Bạn đang trên đường đến {$this->booking->destination}",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Chuyến đi bắt đầu',
            'body'       => "Bạn đang trên đường đến {$this->booking->destination}",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
