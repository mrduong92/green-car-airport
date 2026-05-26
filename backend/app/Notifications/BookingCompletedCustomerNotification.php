<?php
namespace App\Notifications;
use App\Channels\WebPushChannel;
use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class BookingCompletedCustomerNotification extends Notification implements ShouldQueue
{
    use Queueable;
    public function __construct(private Booking $booking) {}
    public function via($notifiable): array { return ['database', WebPushChannel::class]; }
    public function toWebPush($notifiable, $notification): array {
        $price = number_format($this->booking->price - $this->booking->discount + $this->booking->surcharge, 0, ',', '.');
        return [
            'title' => 'Hoàn thành chuyến',
            'body'  => "Cảm ơn bạn! Chuyến #{$this->booking->id} · {$price}đ",
            'data'  => ['action' => 'view_booking', 'booking_id' => $this->booking->id],
        ];
    }
    public function toArray($notifiable): array {
        return [
            'title'      => 'Hoàn thành chuyến',
            'body'       => "Cảm ơn bạn! Chuyến #{$this->booking->id} đã hoàn thành",
            'action'     => 'view_booking',
            'booking_id' => $this->booking->id,
        ];
    }
}
