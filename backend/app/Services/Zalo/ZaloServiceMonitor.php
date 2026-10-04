<?php

namespace App\Services\Zalo;

use Illuminate\Support\Facades\Cache;

/**
 * Theo dõi service Zalo qua heartbeat (lưu cache). Service hỏng là hỏng ÂM THẦM:
 * tab Free đứng yên mà không có lỗi nào — nên phải chủ động kiểm.
 * Laravel không có tin thô (nằm ở SQLite của service), nên nhịp tin lấy từ
 * last_message_at trong heartbeat.
 */
class ZaloServiceMonitor
{
    private const SERVICES_KEY = 'zalo:services';

    public function recordHeartbeat(array $data): void
    {
        // Lưu thời điểm thấy lần cuối để dọn service đã ngừng (xem status()).
        $services = Cache::get(self::SERVICES_KEY, []);
        $services[$data['service_id']] = now()->timestamp;
        Cache::forever(self::SERVICES_KEY, $services);

        Cache::put(
            "zalo:heartbeat:{$data['service_id']}",
            $data + ['received_at' => now()->timestamp],
            now()->addDay()
        );
    }

    /** @return array{status: int, lines: list<string>} 0 ổn, 1 có vấn đề, 2 chưa service nào báo */
    public function status(): array
    {
        $now = now();
        $services = $this->activeServices($now->timestamp);
        if ($services === []) {
            return ['status' => 2, 'lines' => ['Chưa có service Zalo nào từng gửi heartbeat']];
        }

        $status = 0;
        $lines = [];
        $lastMessageMs = null;

        foreach ($services as $id) {
            $hb = Cache::get("zalo:heartbeat:{$id}");
            $age = $hb === null ? null : $now->timestamp - $hb['received_at'];

            if ($age === null || $age > (int) config('zalo.heartbeat_stale_seconds')) {
                $status = 1;
                $lines[] = "{$id}: mất heartbeat".($age === null ? '' : " ({$age} giây)");

                continue;
            }

            $down = collect($hb['accounts'])->where('connected', false)->pluck('id')->all();
            if ($hb['accounts'] === []) {
                $status = 1;
                $lines[] = "{$id}: không có tài khoản Zalo nào";
            } elseif ($down !== []) {
                $status = 1;
                $lines[] = "{$id}: tài khoản mất kết nối: ".implode(', ', $down);
            } else {
                $lines[] = "{$id}: OK (".count($hb['accounts'])." tài khoản, đã lưu {$hb['stored_total']} tin, trùng {$hb['duplicates_total']})";
            }

            $backlog = (int) ($hb['outbox_backlog'] ?? 0);
            if ($backlog > (int) config('zalo.rides_backlog_alert')) {
                $status = 1;
                $lines[] = "{$id}: hộp thư đi tồn {$backlog} cuốc (Laravel không nhận được cuốc?)";
            }

            if ($hb['last_message_at'] !== null) {
                $lastMessageMs = max($lastMessageMs ?? 0, (int) $hb['last_message_at']);
            }
        }

        [$from, $to] = config('zalo.active_hours');
        $localHour = $now->copy()->setTimezone(config('zalo.timezone'))->hour;
        if ($localHour >= $from && $localHour < $to) {
            $minutes = (int) config('zalo.silence_alert_minutes');
            if ($lastMessageMs === null || $lastMessageMs < $now->copy()->subMinutes($minutes)->getTimestampMs()) {
                $status = 1;
                $lines[] = "Không có tin mới trong {$minutes} phút (300 nhóm mà im là bất thường)";
            }
        }

        return ['status' => $status, 'lines' => $lines];
    }

    /** @return list<string> service còn theo dõi; bỏ service im quá zalo.forget_after_days ngày */
    private function activeServices(int $nowTs): array
    {
        $services = Cache::get(self::SERVICES_KEY, []);
        $cutoff = $nowTs - (int) config('zalo.forget_after_days') * 86400;
        $kept = array_filter($services, fn ($lastSeen) => (int) $lastSeen >= $cutoff);

        if (count($kept) !== count($services)) {
            Cache::forever(self::SERVICES_KEY, $kept);
        }

        return array_map('strval', array_keys($kept));
    }
}
