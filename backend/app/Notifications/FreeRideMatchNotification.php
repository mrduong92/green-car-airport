<?php

namespace App\Notifications;

use App\Channels\WebPushChannel;
use App\Models\FreeRide;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

// CHỈ web push, KHÔNG lưu vào bảng notifications — như NewBookingAvailableNotification: nội dung
// hết giá trị sau vài phút, tài xế mở tab Free ra là thấy, không cần lưu lịch sử.
class FreeRideMatchNotification extends Notification implements ShouldQueue
{
    use Queueable;

    private const TZ = 'Asia/Ho_Chi_Minh';

    /** @param Collection<int, FreeRide> $rides Cuốc khớp bộ lọc, đã qua điều kiện hiển thị — ít nhất 1 cuốc. */
    public function __construct(private Collection $rides) {}

    public function via($notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush($notifiable, $notification): array
    {
        return [
            'title' => 'Cuốc Free',
            'body' => $this->rides->count() === 1
                ? $this->describe($this->rides->first())
                : "{$this->rides->count()} cuốc Free mới phù hợp",
            'data' => ['action' => 'open_url', 'url' => '/driver/free'],
        ];
    }

    private function describe(FreeRide $ride): string
    {
        $time = $ride->pickup_at
            ? $ride->pickup_at->copy()->setTimezone(self::TZ)->format('H:i')
            : 'Đi luôn';

        $price = $ride->is_free
            ? 'Miễn phí'
            : ($ride->price !== null ? number_format($ride->price, 0, ',', '.').'đ' : null);

        $meta = implode(' · ', array_filter([$time, $price]));

        return "Cuốc Free: {$ride->pickup} → {$ride->destination} · {$meta}";
    }
}
