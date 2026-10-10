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
 * Mốc "cuốc mới" HOÀN TOÀN theo id (không dùng created_at): ingest đóng dấu created_at bằng $now
 * lấy ở ĐẦU request nhưng commit ở CUỐI, độ phân giải lại chỉ tới giây — cuốc commit sau khi job
 * đã chốt maxId nhưng có created_at trước lúc job bắt đầu sẽ bị sàn created_at chặn vĩnh viễn.
 *
 * - Mỗi lần chạy chốt maxId NGAY từ đầu và chỉ xét id ∈ (floorId, maxId]; cuốc ghi thêm trong lúc
 *   job chạy có id > maxId → để dành cho lần chạy kế tiếp (sàn id của nó chưa vượt qua).
 * - Cảnh báo ĐÃ từng push: floorId = last_pushed_max_id (maxId của lần push đó). Tài xế đang trong
 *   2 phút chặn bị bỏ qua lượt này, mốc không đổi → lần chạy sau (hết chặn) tự GỘP cuốc dồn lại.
 * - Bật cảnh báo / đổi bộ lọc: model DriverFreeRideAlert đặt last_pushed_max_id = max(id) hiện có
 *   (xem booted()) — không dội ngược cuốc cũ.
 * - Cảnh báo CHƯA từng push: floorId = max(mốc lúc bật, maxId lần chạy trước — lưu cache), để cuốc
 *   đã được xét mà không khớp (vd. người bắn đang bị ẩn) không bị push muộn khi điều kiện đổi.
 *
 * Mốc id chỉ đúng khi id hiện ra (commit) theo thứ tự tăng dần: hai lô ingest song song có thể
 * commit lệch (id nhỏ hiện ra sau khi job đã vượt qua nó). ZaloRideIngestService chặn điều đó bằng
 * khoá Cache::lock('zalo:ingest') — các lô ghi tuần tự, chờ khoá quá lâu thì trả 503 để service gửi
 * lại, không bao giờ ghi song song.
 */
class NotifyFreeRideAlerts implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 15;

    private const CACHE_KEY = 'free_rides:alerts:last_processed_max_id';

    private const QUIET_MINUTES = 2;

    public function handle(): void
    {
        $startedAt = now();
        $maxId = (int) (FreeRide::max('id') ?? 0);

        $cached = Cache::get(self::CACHE_KEY);
        $previousMaxId = is_numeric($cached) ? (int) $cached : null;

        // Tài xế đang bị chặn 2 phút nhưng đã có cuốc khớp đang chờ gộp — nhớ lại mốc hết chặn sớm
        // nhất để xếp lại job đúng lúc đó, không phải chờ tới khi có cuốc Free mới kế tiếp.
        $resumeAt = [];

        if ($maxId > 0) {
            $alerts = DriverFreeRideAlert::query()->where('enabled', true)->get();

            foreach ($alerts as $alert) {
                $pendingResumeAt = $this->processAlert($alert, $previousMaxId, $startedAt, $maxId);
                if ($pendingResumeAt !== null) {
                    $resumeAt[] = $pendingResumeAt;
                }
            }
        }

        // Chỉ tiến mốc sau khi đã xử lý xong lô này, và tiến tới maxId chốt từ đầu (không phải max hiện
        // tại) — cuốc chèn thêm trong lúc job chạy rơi vào lần chạy kế tiếp.
        Cache::forever(self::CACHE_KEY, max($maxId, $previousMaxId ?? 0));

        if ($resumeAt !== []) {
            static::dispatch()->delay(min($resumeAt)->addSecond());
        }
    }

    // Trả về mốc nên xếp lại job (nếu cảnh báo đang bị chặn nhưng có cuốc chờ gộp), ngược lại null.
    private function processAlert(DriverFreeRideAlert $alert, ?int $previousMaxId, Carbon $now, int $maxId): ?Carbon
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

        $floorId = (int) ($alert->last_pushed_max_id ?? 0);
        if ($alert->last_pushed_at === null) {
            $floorId = max($floorId, $previousMaxId ?? 0);
        }
        if ($floorId >= $maxId) {
            return null;
        }

        $rides = FreeRide::query()
            ->visibleTo($alert->driver_id, [
                'direction' => $alert->direction,
                'seats' => $alert->seats,
                'q' => $alert->keywords,
            ])
            // Không bao giờ push bản trùng (duplicate_of_id) như cuốc mới: scopeExcludingLiveDuplicates()
            // trong visibleTo() chỉ loại bản trùng khi cuốc gốc còn "sống" — cuốc gốc hết hạn SAU khi đã
            // push thì bản trùng lại lọt qua, trong khi tài xế đã được báo về cuốc gốc rồi. Tab Free (driver
            // list, FreeRideController::index) vẫn dùng visibleTo() nguyên vẹn nên giữ nguyên hành vi hiện
            // lại cuốc khi gốc hết hạn.
            ->whereNull('duplicate_of_id')
            ->where('id', '>', $floorId)
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

        // Chỉ ghi 2 cột mốc — không đụng cột bộ lọc nên không kích hoạt việc đặt lại mốc ở model.
        $alert->update(['last_pushed_at' => $now, 'last_pushed_max_id' => $maxId]);

        return null;
    }
}
