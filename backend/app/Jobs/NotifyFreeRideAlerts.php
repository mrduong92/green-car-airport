<?php

namespace App\Jobs;

use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\FreeRide;
use App\Models\User;
use App\Notifications\FreeRideMatchNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Gom tín hiệu như BroadcastFreeRidesSignal: service đẩy lô cuốc, ZaloServiceController::rides
 * xếp job này khi có cuốc MỚI (không phải cập nhật) với delay 10 giây, job là DUY NHẤT tới khi
 * bắt đầu chạy — nhiều lô cuốc mới tới liên tiếp chỉ sinh ra ≤ 1 lần chạy / 10 giây.
 *
 * Mỗi cảnh báo (driver_free_ride_alerts) dùng last_pushed_at làm mốc "cuốc tạo sau lần push
 * trước" của riêng tài xế đó — không chỉ để chống làm phiền (≤ 1 push / 2 phút) mà còn để GỘP:
 * tài xế đang trong 2 phút chặn bị bỏ qua lượt này, last_pushed_at không đổi, nên lần chạy sau
 * (khi hết chặn) mốc so sánh vẫn là lần push trước đó — tự động gồm cả cuốc dồn trong lúc bị chặn.
 * Cảnh báo CHƯA từng push (last_pushed_at null) dùng mốc lần chạy job trước (lưu cache) làm sàn,
 * để không dội ngược toàn bộ cuốc cũ đang hiển thị mỗi khi job chạy — trừ lần chạy đầu tiên (chưa
 * có mốc nào trong cache) thì coi mọi cuốc hiện có là "mới", chỉ xảy ra một lần sau khi triển khai.
 */
class NotifyFreeRideAlerts implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 15;

    private const CACHE_KEY = 'free_rides:alerts:last_run_at';

    private const QUIET_MINUTES = 2;

    public function handle(): void
    {
        $startedAt = now();
        $previousMarkRaw = Cache::get(self::CACHE_KEY);
        // Job chưa từng chạy (triển khai mới / cache bị xoá): coi như chưa có mốc nào — mọi cuốc hiện
        // có đều tính là "mới" cho các cảnh báo chưa từng push. Chỉ xảy ra một lần, chấp nhận được.
        $previousMark = $previousMarkRaw ? Carbon::parse($previousMarkRaw) : Carbon::createFromTimestamp(0);

        $alerts = DriverFreeRideAlert::query()
            ->where('enabled', true)
            ->where(function ($q) use ($startedAt) {
                $q->whereNull('last_pushed_at')
                    ->orWhere('last_pushed_at', '<=', $startedAt->copy()->subMinutes(self::QUIET_MINUTES));
            })
            ->get();

        foreach ($alerts as $alert) {
            $this->processAlert($alert, $previousMark, $startedAt);
        }

        // Chỉ tiến mốc sau khi đã xử lý xong lô này — mốc bắt đầu từ lúc job được gọi, không phải
        // "bây giờ" sau khi xử lý, để cuốc chèn thêm trong lúc job chạy rơi vào lần chạy kế tiếp.
        Cache::forever(self::CACHE_KEY, $startedAt);
    }

    private function processAlert(DriverFreeRideAlert $alert, Carbon $previousMark, Carbon $now): void
    {
        $driver = User::find($alert->driver_id);
        if (! $driver || $driver->role !== 'driver' || $driver->driverProfile?->status !== 'active') {
            return;
        }

        if (! DeviceToken::where('user_id', $alert->driver_id)->exists()) {
            return;
        }

        $floor = $alert->last_pushed_at ?? $previousMark;

        $rides = FreeRide::query()
            ->visibleTo($alert->driver_id, [
                'direction' => $alert->direction,
                'seats' => $alert->seats,
                'q' => $alert->keywords,
            ])
            ->where('created_at', '>', $floor)
            ->orderBy('posted_at')
            ->get();

        $rides = FreeRide::filterSafe($rides)->values();
        if ($rides->isEmpty()) {
            return;
        }

        $driver->notify(new FreeRideMatchNotification($rides));
        $alert->update(['last_pushed_at' => $now]);
    }
}
