<?php

namespace App\Jobs;

use App\Events\FreeRidesUpdated;
use App\Models\FreeRide;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;

/**
 * Gom tín hiệu: service đẩy lô mỗi 2 giây, job được xếp với delay 2 giây và là DUY NHẤT tới khi bắt đầu chạy —
 * các lô tới trong cửa sổ đó không xếp thêm job, nên toàn hệ thống phát ≤ ~1 tín hiệu / 2 giây.
 */
class BroadcastFreeRidesSignal implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 10;

    public function handle(): void
    {
        $latest = FreeRide::max('updated_at');
        if ($latest === null) {
            return;
        }

        event(new FreeRidesUpdated(Carbon::parse($latest)->getTimestampMs()));
    }
}
