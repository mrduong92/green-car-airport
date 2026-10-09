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
 *
 * Mốc còn phải tính tới lúc cảnh báo được BẬT/ĐỔI (updated_at): floor = max(last_pushed_at ??
 * previousMark, updated_at) — nếu không, bật cảnh báo sau khi đã có sẵn cuốc cũ khớp (hoặc đổi bộ
 * lọc) sẽ dội ngược/gồm nhầm cuốc tạo TRƯỚC thời điểm đó. updated_at ở đây CHỈ được đổi khi tài xế
 * thật sự lưu lại bộ lọc (FreeRideController::saveAlert) — job tự ghi last_pushed_at với
 * `timestamps = false` nên KHÔNG đụng vào updated_at (xem processAlert()), để job không tự "che"
 * mất cuốc bị hoãn qua lần chạy sau (mục id high-water mark bên dưới) bằng chính mốc nó vừa ghi.
 *
 * Cảnh báo CHƯA từng push (last_pushed_at null) dùng mốc lần chạy job trước (lưu cache) làm sàn,
 * để không dội ngược toàn bộ cuốc cũ đang hiển thị mỗi khi job chạy — trừ lần chạy đầu tiên (chưa
 * có mốc nào trong cache) thì dùng $startedAt trừ một khoảng ân hạn nhỏ (không phải epoch 0): job
 * được xếp với delay 10 giây sau khi cuốc đã lưu nên cuốc kích hoạt job có thể đã tồn tại tới ~10
 * giây trước khi job này thật sự chạy.
 *
 * Mỗi lần chạy chốt id cuốc cao nhất (maxId) NGAY từ đầu và chỉ xét cuốc có id ≤ maxId — cuốc
 * service ghi thêm trong lúc job đang xử lý (hiếm nhưng có thể) sẽ có id lớn hơn, bị loại khỏi lần
 * chạy này một cách CHÍNH XÁC (so bằng id, không lệ thuộc độ phân giải giây của created_at) và để
 * dành cho lần chạy kế tiếp — không mất, không trùng.
 */
class NotifyFreeRideAlerts implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 15;

    private const CACHE_KEY = 'free_rides:alerts:last_run_at';

    private const QUIET_MINUTES = 2;

    // Xem ghi chú ở đầu file: delay dispatch của ZaloServiceController::rides là 10 giây.
    private const FIRST_RUN_GRACE_SECONDS = 20;

    public function handle(): void
    {
        $startedAt = now();
        $maxId = FreeRide::max('id');

        if ($maxId === null) {
            Cache::forever(self::CACHE_KEY, $startedAt);

            return;
        }

        $previousMarkRaw = Cache::get(self::CACHE_KEY);
        $previousMark = $previousMarkRaw
            ? Carbon::parse($previousMarkRaw)
            : $startedAt->copy()->subSeconds(self::FIRST_RUN_GRACE_SECONDS);

        // Tài xế đang bị chặn 2 phút nhưng đã có cuốc khớp đang chờ gộp — nhớ lại mốc hết chặn sớm
        // nhất để xếp lại job đúng lúc đó (mục 5), không phải chờ tới khi có cuốc Free mới kế tiếp.
        $resumeAt = [];

        $alerts = DriverFreeRideAlert::query()->where('enabled', true)->get();

        foreach ($alerts as $alert) {
            $pendingResumeAt = $this->processAlert($alert, $previousMark, $startedAt, $maxId);
            if ($pendingResumeAt !== null) {
                $resumeAt[] = $pendingResumeAt;
            }
        }

        // Chỉ tiến mốc sau khi đã xử lý xong lô này — mốc bắt đầu từ lúc job được gọi, không phải
        // "bây giờ" sau khi xử lý, để cuốc chèn thêm trong lúc job chạy rơi vào lần chạy kế tiếp.
        Cache::forever(self::CACHE_KEY, $startedAt);

        if ($resumeAt !== []) {
            static::dispatch()->delay(min($resumeAt)->addSecond());
        }
    }

    // Trả về mốc nên xếp lại job (nếu cảnh báo đang bị chặn nhưng có cuốc chờ gộp), ngược lại null.
    private function processAlert(DriverFreeRideAlert $alert, Carbon $previousMark, Carbon $now, int $maxId): ?Carbon
    {
        $driver = User::find($alert->driver_id);
        if (! $driver || $driver->role !== 'driver' || $driver->driverProfile?->status !== 'active') {
            return null;
        }

        if (! DeviceToken::where('user_id', $alert->driver_id)->exists()) {
            return null;
        }

        $cooldownEndsAt = $alert->last_pushed_at?->copy()->addMinutes(self::QUIET_MINUTES);
        $gated = $cooldownEndsAt !== null && $now->lt($cooldownEndsAt);

        $floor = max($alert->last_pushed_at ?? $previousMark, $alert->updated_at);

        $rides = FreeRide::query()
            ->visibleTo($alert->driver_id, [
                'direction' => $alert->direction,
                'seats' => $alert->seats,
                'q' => $alert->keywords,
            ])
            ->where('created_at', '>', $floor)
            ->where('id', '<=', $maxId)
            ->orderBy('posted_at')
            ->get();

        $rides = FreeRide::filterSafe($rides)->values();
        if ($rides->isEmpty()) {
            return null;
        }

        if ($gated) {
            return $cooldownEndsAt;
        }

        $driver->notify(new FreeRideMatchNotification($rides));

        // updated_at CHỈ phản ánh lúc tài xế thật sự bật/đổi bộ lọc (qua FreeRideController::saveAlert)
        // — tắt timestamps() khi job tự ghi last_pushed_at, nếu không updated_at bị job làm mới theo mỗi
        // lần push, và một cuốc bị loại vì chặn id (mục 4) trong CHÍNH lần chạy có push thành công sẽ bị
        // mốc updated_at mới đó (luôn muộn hơn cuốc kia) chặn vĩnh viễn ở mọi lần chạy sau — không phải
        // do đổi bộ lọc, chỉ đơn thuần tới trong lúc job đang xử lý.
        $alert->timestamps = false;
        $alert->update(['last_pushed_at' => $now]);
        $alert->timestamps = true;

        return null;
    }
}
