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
            set_time_limit(0);
            ignore_user_abort(true);
            @ini_set('zlib.output_compression', 0);

            $this->emit(['type' => 'connected', 'driver_id' => $user->id]);

            $maxAt = time() + 300; // 5 min, then EventSource auto-reconnects

            $cfg      = config('database.redis.default');
            $host     = $cfg['host']     ?? '127.0.0.1';
            $port     = (int) ($cfg['port']     ?? 6379);
            $password = $cfg['password'] ?? null;
            $database = (int) ($cfg['database'] ?? 0);

            while (! connection_aborted() && time() < $maxAt) {
                // Phase 1: connect — failure exits the stream entirely
                try {
                    $redis = new \Redis();
                    $redis->connect($host, $port, 2.0);
                    if ($password !== null && $password !== 'null') {
                        $redis->auth($password);
                    }
                    if ($database !== 0) {
                        $redis->select($database);
                    }
                } catch (\RedisException) {
                    // Redis unavailable — bail out, EventSource will reconnect in 3s
                    break;
                }

                // Phase 2: subscribe — read-timeout = heartbeat, then resubscribe
                try {
                    $redis->setOption(\Redis::OPT_READ_TIMEOUT, 5);

                    $redis->subscribe(['driver.trips.events'], function ($r, $channel, $message) use ($maxAt) {
                        $data = json_decode($message, true);
                        if ($data) {
                            $this->emit($data);
                        }
                        if (connection_aborted() || time() >= $maxAt) {
                            $r->unsubscribe();
                        }
                    });

                    $redis->close(); // clean exit — connection closed before next iteration
                } catch (\RedisException) {
                    // OPT_READ_TIMEOUT (5s no message) → heartbeat, then subscribe again
                    $redis->close();
                    if (! connection_aborted()) {
                        echo ": ping\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                    }
                } catch (\Throwable) {
                    $redis->close();
                    break;
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
