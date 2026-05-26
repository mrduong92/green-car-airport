<?php
namespace App\Jobs;

use App\Models\Booking;
use App\Models\User;
use App\Notifications\NewBookingAvailableNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendNewBookingBroadcastJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private Booking $booking) {}

    public function handle(): void
    {
        User::where('role', 'driver')
            ->whereHas('driverProfile', fn ($q) => $q->where('status', 'active')->where('is_online', true))
            ->each(fn ($driver) => $driver->notify(new NewBookingAvailableNotification($this->booking)));
    }
}
