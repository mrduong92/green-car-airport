<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
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
            $this->emit(['type' => 'connected', 'driver_id' => $user->id]);

            $host  = config('database.redis.default.host', '127.0.0.1');
            $port  = (int) config('database.redis.default.port', 6379);
            $maxAt = time() + 300; // 5 min max, then EventSource auto-reconnects

            while (! connection_aborted() && time() < $maxAt) {
                $redis = new \Redis();
                $redis->connect($host, $port);
                $redis->setOption(\Redis::OPT_READ_TIMEOUT, 25);

                try {
                    $redis->subscribe(['driver.new-booking'], function ($redis, $channel, $message) {
                        $this->emit(json_decode($message, true) ?? []);
                        return false; // unsubscribe after each message → re-enter loop
                    });
                } catch (\RedisException) {
                    // read_timeout hit — send heartbeat comment and re-subscribe
                    if (! connection_aborted()) {
                        echo ": ping\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                    }
                } finally {
                    try { $redis->close(); } catch (\Throwable) {}
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
