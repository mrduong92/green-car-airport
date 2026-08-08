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

    /**
     * CHỈ web push, KHÔNG lưu vào bảng notifications.
     *
     * Đây là loại thông báo duy nhất bắn cho MỌI tài xế online, nên số dòng nó
     * sinh ra tăng theo (số cuốc × số tài xế online), trong khi mọi loại khác
     * chỉ tăng theo số cuốc. Đo trên production 2026-08-09 khi mới có ~4 tài xế
     * online: loại này đã chiếm 39% bảng; ở 500 tài xế online sẽ là hơn 99%.
     *
     * Mà nội dung của nó hết giá trị sau vài phút — cuốc bị người khác nhận là
     * dòng thông báo thành rác. Thứ hữu ích là cú push đẩy tới máy tài xế; còn
     * danh sách cuốc thì tài xế mở app ra là thấy.
     */
    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable, $notification): array
    {
        $price = number_format($this->booking->price, 0, ',', '.');

        return [
            'title' => 'Có cuốc mới!',
            'body' => "{$this->booking->pickup} → {$this->booking->destination} · {$price}đ · {$this->booking->distance_km}km",
            'data' => ['action' => 'view_trip', 'booking_id' => $this->booking->id],
        ];
    }

    public function toArray($notifiable): array
    {
        return [
            'title' => 'Có cuốc mới!',
            'body' => "{$this->booking->pickup} → {$this->booking->destination}",
            'action' => 'view_trip',
            'booking_id' => $this->booking->id,
        ];
    }
}
