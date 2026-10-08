<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Tín hiệu "có cuốc Free mới" — chỉ mang mốc thời gian. Reverb giới hạn 10 KB/tin nhắn nên KHÔNG gửi
 * danh sách cuốc; app tự gọi GET /driver/free-rides?since=latest theo bộ lọc của mình.
 * ShouldBroadcastNow vì đã chạy trong job BroadcastFreeRidesSignal (không xếp hàng thêm lần nữa).
 */
class FreeRidesUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $latest) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('driver.free-rides');
    }

    public function broadcastAs(): string
    {
        return 'free-rides.updated';
    }

    /** @return array<string, int> */
    public function broadcastWith(): array
    {
        return ['latest' => $this->latest];
    }
}
