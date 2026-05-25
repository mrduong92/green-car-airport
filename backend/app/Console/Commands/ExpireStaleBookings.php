<?php

namespace App\Console\Commands;

use App\Models\Booking;
use Illuminate\Console\Command;

class ExpireStaleBookings extends Command
{
    protected $signature = 'bookings:expire';
    protected $description = 'Cancel bookings older than 24h still waiting for a driver';

    public function handle(): void
    {
        $count = Booking::where('status', 'finding_driver')
            ->where('created_at', '<=', now()->subHours(24))
            ->update([
                'status'       => 'cancelled',
                'cancelled_at' => now(),
                'cancelled_by' => 'system',
            ]);

        $this->info("Expired {$count} stale booking(s).");
    }
}
