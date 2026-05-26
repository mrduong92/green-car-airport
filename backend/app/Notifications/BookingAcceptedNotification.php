<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class BookingAcceptedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking, private User $driver) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        return [
            'title' => 'Tìm được tài xế!',
            'body'  => "{$this->driver->name} đang trên đường đến đón bạn",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Tìm được tài xế!',
            'body'       => "{$this->driver->name} đang trên đường đến đón bạn",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
