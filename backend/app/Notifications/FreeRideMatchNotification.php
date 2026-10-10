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

    private const RAW_SNIPPET_LENGTH = 80;

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
            // Tag riêng để push Cuốc Free không âm thầm đè push cuốc trả khách (mặc định
            // 'greenca-notification' ở sw.ts) khi cả hai tới gần nhau — xem sw.ts.
            'tag' => 'greenca-free-ride',
        ];
    }

    private function describe(FreeRide $ride): string
    {
        // is_free = "Không chiết khấu" trong domain này (xem FreeRideCard) — KHÔNG phải cuốc miễn phí,
        // và giá (nếu có) vẫn phải hiện — không được ẩn đi vì cờ này.
        $parts = [$this->timeLabel($ride)];
        if ($ride->price !== null) {
            $parts[] = number_format($ride->price, 0, ',', '.').'đ';
        }
        if ($ride->is_free) {
            $parts[] = 'Không chiết khấu';
        }

        return "Cuốc Free: {$this->routeLabel($ride)} · ".implode(' · ', $parts);
    }

    // Cuốc nguyên văn (AI/quy tắc không tách được pickup/destination): dùng đoạn trích raw_text
    // thay vì để trống " →  " vô nghĩa.
    private function routeLabel(FreeRide $ride): string
    {
        if (! empty($ride->pickup)) {
            return "{$ride->pickup} → ".($ride->destination ?: '?');
        }

        $trimmed = trim($ride->raw_text);

        return mb_strlen($trimmed) <= self::RAW_SNIPPET_LENGTH
            ? $trimmed
            : mb_substr($trimmed, 0, self::RAW_SNIPPET_LENGTH).'…';
    }

    private function timeLabel(FreeRide $ride): string
    {
        if ($ride->pickup_at) {
            return $ride->pickup_at->copy()->setTimezone(self::TZ)->format('H:i');
        }

        // Cuốc "Đi luôn" không có pickup_at nhưng có thể vẫn còn pickup_time_text thô (giờ dạng chữ
        // AI/quy tắc không quy đổi được thành mốc giờ) — hiện cái đó trước khi rơi về "Đi luôn".
        return $ride->pickup_time_text ?: 'Đi luôn';
    }
}
