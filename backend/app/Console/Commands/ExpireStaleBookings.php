<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Notifications\BookingExpiredNotification;
use App\Support\AvailableTripsCache;
use Illuminate\Console\Command;

class ExpireStaleBookings extends Command
{
    protected $signature = 'bookings:expire';
    protected $description = 'Cancel bookings older than 24h still waiting for a driver';

    public function handle(): void
    {
        $staleBookings = Booking::with('customer')
            ->where('status', 'finding_driver')
            ->where('created_at', '<=', now()->subHours(24))
            ->get();

        foreach ($staleBookings as $booking) {
            $booking->update([
                'status'       => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => 'system',
            ]);
            $booking->customer?->notify(new BookingExpiredNotification($booking));
        }

        if ($staleBookings->isNotEmpty()) {
            // Cuốc rời sàn → cache danh sách chờ của tài xế đã cũ.
            AvailableTripsCache::flush();
        }

        $this->info("Expired {$staleBookings->count()} stale booking(s).");
    }
}
