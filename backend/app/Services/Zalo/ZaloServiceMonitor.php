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

    /**
     * Dữ liệu cho trang admin "Tình trạng" — một hàng mỗi service còn trong cache (bỏ service
     * đã bị dọn vì im quá zalo.forget_after_days ngày, hoặc hết TTL heartbeat 1 ngày).
     *
     * @return list<array{service_id: string, last_heartbeat_at: int, stale: bool, accounts: list<array{id: string, connected: bool, logged_in: ?bool, last_error: ?string, zalo_uid: ?string, zalo_name: ?string, logged_in_at: ?int, groups: ?int}>, ai_spent_today_usd: float, ai_budget_usd: float, outbox_backlog: int, held_back_rides: int, qr_ok_24h: int, qr_empty_24h: int}>
     */
    public function snapshot(): array
    {
        $now = now();
        $staleAfter = (int) config('zalo.heartbeat_stale_seconds');

        $services = [];
        foreach ($this->activeServices($now->timestamp) as $id) {
            $hb = Cache::get("zalo:heartbeat:{$id}");
            if ($hb === null) {
                continue;
            }

            $services[] = [
                'service_id' => $id,
                'last_heartbeat_at' => $hb['received_at'] * 1000,
                'stale' => ($now->timestamp - $hb['received_at']) > $staleAfter,
                'accounts' => collect($hb['accounts'])->map(fn ($a) => [
                    'id' => $a['id'],
                    'connected' => (bool) $a['connected'],
                    'logged_in' => array_key_exists('logged_in', $a) ? (bool) $a['logged_in'] : null,
                    'last_error' => $a['last_error'] ?? null,
                    // Giai đoạn 5 (tab "Nick Zalo"): tên/UID lấy 1 lần sau đăng nhập, lúc đăng
                    // nhập (ms), số nhóm hiện có — payload cũ (trước giai đoạn 5) không có nên null.
                    'zalo_uid' => $a['zalo_uid'] ?? null,
                    'zalo_name' => $a['zalo_name'] ?? null,
                    'logged_in_at' => $a['logged_in_at'] ?? null,
                    'groups' => array_key_exists('groups', $a) ? (int) $a['groups'] : null,
                ])->values()->all(),
                'ai_spent_today_usd' => (float) ($hb['ai_spent_today_usd'] ?? 0),
                'ai_budget_usd' => (float) ($hb['ai_budget_usd'] ?? 0),
                'outbox_backlog' => (int) ($hb['outbox_backlog'] ?? 0),
                'held_back_rides' => (int) ($hb['held_back_rides'] ?? 0),
                'qr_ok_24h' => (int) ($hb['qr_ok_24h'] ?? 0),
                'qr_empty_24h' => (int) ($hb['qr_empty_24h'] ?? 0),
            ];
        }

        return $services;
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

            // Giải mã QR hỏng thì mọi người bắn thành 'empty' và cuốc bị giữ lại mãi mà không có lỗi nào.
            // Cần ≥ 20 mẫu trong 24 giờ để tỷ lệ có nghĩa.
            $qrOk = (int) ($hb['qr_ok_24h'] ?? 0);
            $qrEmpty = (int) ($hb['qr_empty_24h'] ?? 0);
            if ($qrOk + $qrEmpty >= 20 && $qrEmpty / ($qrOk + $qrEmpty) > 0.8) {
                $status = 1;
                $lines[] = "{$id}: Tỷ lệ người bắn không lấy được mã QR bất thường — kiểm tra giải mã QR ({$qrEmpty}/".($qrOk + $qrEmpty).' trong 24 giờ)';
            }

            $heldBack = (int) ($hb['held_back_rides'] ?? 0);
            if ($heldBack > (int) config('zalo.held_back_alert', 200)) {
                $status = 1;
                $lines[] = "{$id}: {$heldBack} cuốc bị giữ lại vì người bắn chưa có mã QR (hàng lấy mã QR kẹt?)";
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
