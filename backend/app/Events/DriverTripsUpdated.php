<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Danh sách cuốc chờ vừa thay đổi — mọi tài xế cần refetch.
 *
 * Dùng ShouldBroadcast (qua queue) chứ KHÔNG phải ShouldBroadcastNow: nếu
 * broadcast chạy đồng bộ trong request mà Reverb chết thì exception sẽ làm hỏng
 * luôn request đặt/nhận cuốc. Qua queue thì Reverb chết chỉ mất realtime, còn
 * nghiệp vụ tiền bạc vẫn đi trọn vẹn.
 *
 * ⚠️ Đánh đổi: phụ thuộc queue worker. Worker chết = không có realtime, và
 * KHÔNG có lỗi nào hiện ra (xem mục cảnh báo worker trong docs/DEPLOY.md).
 */
class DriverTripsUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /** @param string $type new_booking | trip_taken | booking_cancelled */
    public function __construct(
        public string $type,
        public int $bookingId,
        public ?int $driverId = null,
    ) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('driver.trips');
    }

    /** Tên cố định để client chỉ cần lắng nghe 1 sự kiện rồi rẽ theo `type`. */
    public function broadcastAs(): string
    {
        return 'trips.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return array_filter([
            'type' => $this->type,
            'booking_id' => $this->bookingId,
            'driver_id' => $this->driverId,
        ], fn ($v) => $v !== null);
    }
}
