<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Notifications\BookingExpiredNotification;
use App\Support\AvailableTripsCache;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExpireStaleBookings extends Command
{
    protected $signature = 'bookings:expire';
    protected $description = 'Cancel bookings older than 24h still waiting for a driver';

    public function handle(): void
    {
        $staleIds = Booking::where('status', 'finding_driver')
            ->where('created_at', '<=', now()->subHours(24))
            ->pluck('id');

        $expired = 0;
        foreach ($staleIds as $id) {
            // Khoá + kiểm lại từng cuốc: tài xế có thể vừa nhận (đã bị trừ phí + tạm giữ)
            // giữa lúc lấy danh sách và lúc huỷ. Huỷ bằng bản cũ sẽ nuốt tiền của họ.
            $booking = DB::transaction(function () use ($id) {
                $booking = Booking::lockForUpdate()->find($id);
                if (! $booking || $booking->status !== 'finding_driver') {
                    return null;
                }

                $booking->update([
                    'status'       => 'cancelled',
                    'cancelled_at' => now(),
                    'cancelled_by' => 'system',
                ]);

                return $booking;
            });

            if ($booking) {
                $expired++;
                $booking->customer?->notify(new BookingExpiredNotification($booking));
            }
        }

        if ($expired > 0) {
            // Cuốc rời sàn → cache danh sách chờ của tài xế đã cũ.
            AvailableTripsCache::flush();
        }

        $this->info("Expired {$expired} stale booking(s).");
    }
}
