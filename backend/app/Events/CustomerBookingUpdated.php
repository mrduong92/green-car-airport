<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Trạng thái chuyến của MỘT khách vừa đổi — chỉ khách đó nhận.
 *
 * Xem ghi chú về ShouldBroadcast (queue) vs ShouldBroadcastNow ở
 * {@see DriverTripsUpdated}.
 */
class CustomerBookingUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  string  $type  booking_accepted | trip_started | trip_completed
     *                        | booking_cancelled_by_driver
     */
    public function __construct(
        public int $customerId,
        public string $type,
        public int $bookingId,
    ) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('customer.'.$this->customerId);
    }

    public function broadcastAs(): string
    {
        return 'booking.updated';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'type' => $this->type,
            'booking_id' => $this->bookingId,
        ];
    }
}
