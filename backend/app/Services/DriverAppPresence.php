<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Tài xế đang mở app tài xế trên màn hình (tab đang hiển thị). App báo nhịp mỗi 45 giây khi hiển
 * thị và báo tắt ngay khi chuyển nền; cờ tự hết hạn sau TTL nếu app bị đóng đột ngột.
 *
 * Dùng để không push cuốc Free khi tài xế đang mở app. Không chặn được ở service worker: iOS thu
 * hồi đăng ký push nếu nhận push mà không hiện thông báo (kể cả hiện rồi đóng ngay).
 */
class DriverAppPresence
{
    public const TTL_SECONDS = 70;

    public static function mark(int $driverId, bool $active): void
    {
        if ($active) {
            Cache::put(self::key($driverId), true, self::TTL_SECONDS);
        } else {
            Cache::forget(self::key($driverId));
        }
    }

    public static function isOpen(int $driverId): bool
    {
        return Cache::has(self::key($driverId));
    }

    private static function key(int $driverId): string
    {
        return "driver:app-open:{$driverId}";
    }
}
