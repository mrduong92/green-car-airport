<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class NewBookingAvailableNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        $price = number_format($this->booking->price, 0, ',', '.');
        return [
            'title' => 'Có cuốc mới!',
            'body'  => "{$this->booking->pickup} → {$this->booking->destination} · {$price}đ · {$this->booking->distance_km}km",
            'data'  => ['action' => 'view_trip', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Có cuốc mới!',
            'body'       => "{$this->booking->pickup} → {$this->booking->destination}",
            'action'     => 'view_trip',
            'booking_id' => $this->booking->id,
        ];
    }
}
