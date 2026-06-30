<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StreamController extends Controller
{
    public function trips(Request $request): StreamedResponse
    {
        // EventSource cannot set custom headers, so auth via ?token= query param
        $pat  = PersonalAccessToken::findToken($request->query('token', ''));
        $user = $pat?->tokenable;

        if (! $user || $user->role !== 'driver') {
            abort(401, 'Unauthorized.');
        }

        return response()->stream(function () use ($user) {
            set_time_limit(0);
            ignore_user_abort(true);
            @ini_set('zlib.output_compression', 0);

            $this->emit(['type' => 'connected', 'driver_id' => $user->id]);

            $since = now();
            $maxAt = time() + 300; // 5 min, then EventSource auto-reconnects

            while (! connection_aborted() && time() < $maxAt) {
                sleep(3);

                // New bookings waiting for a driver
                $newBookings = Booking::where('status', 'finding_driver')
                    ->where('created_at', '>', $since)
                    ->get(['id']);

                foreach ($newBookings as $b) {
                    $this->emit(['type' => 'new_booking', 'booking_id' => $b->id]);
                }

                // Bookings that were just cancelled
                $cancelled = Booking::where('status', 'cancelled')
                    ->where('cancelled_at', '>', $since)
                    ->get(['id', 'driver_id']);

                foreach ($cancelled as $b) {
                    $this->emit([
                        'type'       => 'booking_cancelled',
                        'booking_id' => $b->id,
                        'driver_id'  => $b->driver_id,
                    ]);
                }

                // Bookings just accepted by another driver
                $taken = Booking::where('status', 'accepted')
                    ->where('accepted_at', '>', $since)
                    ->where('driver_id', '!=', $user->id)
                    ->get(['id']);

                foreach ($taken as $b) {
                    $this->emit(['type' => 'trip_taken', 'booking_id' => $b->id]);
                }

                $since = now();

                // Heartbeat so nginx / browser knows the connection is alive
                if (! connection_aborted()) {
                    echo ": ping\n\n";
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }
            }
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
            'Connection'        => 'keep-alive',
        ]);
    }

    private function emit(array $data): void
    {
        echo 'data: ' . json_encode($data) . "\n\n";
        if (ob_get_level() > 0) ob_flush();
        flush();
    }
}
