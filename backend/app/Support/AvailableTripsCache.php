<?php

namespace App\Support;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * Cache cho danh sách cuốc đang chờ tài xế nhận.
 *
 * Danh sách này GIỐNG NHAU với mọi tài xế cùng loại xe, mà lại là truy vấn được
 * gọi nhiều nhất hệ thống (mỗi tài xế mở app / mỗi lần refetch). Không cache thì
 * 5.000 tài xế = 5.000 lần quét bảng bookings.
 *
 * Vì sao dùng version key thay vì `Cache::forget` từng key: key được ghép từ tập
 * loại xe phù hợp với xe của tài xế, nên có nhiều biến thể. Tăng version là vô
 * hiệu hoá TẤT CẢ biến thể trong một thao tác.
 *
 * ⚠️ TTL thôi là KHÔNG đủ. Tài xế nhận được thông báo "có cuốc mới" rồi refetch
 * ngay sẽ trúng cache cũ chưa chứa cuốc đó — nhìn thấy thông báo mà danh sách
 * trống. Nên mọi chỗ làm thay đổi tập cuốc `finding_driver` đều PHẢI gọi flush().
 */
class AvailableTripsCache
{
    /** Đủ ngắn để lệch không đáng kể, đủ dài để gom được lượt poll đồng thời. */
    private const TTL = 5;

    private const VERSION_KEY = 'trips:available:version';

    /**
     * @param  bool  $driverIsVip  Tài xế lái xe cá nhân — thấy được cả cuốc VIP.
     *                             PHẢI nằm trong khoá cache: hai nhóm tài xế có danh sách khác nhau, dùng
     *                             chung entry thì nhóm thường đọc trúng cache do nhóm VIP nạp và nhìn
     *                             thấy cuốc VIP, dù query lọc đúng.
     */
    public static function remember(array $vehicleTypes, bool $driverIsVip, Closure $callback): mixed
    {
        return Cache::remember(self::key($vehicleTypes, $driverIsVip), self::TTL, $callback);
    }

    /** Gọi ở MỌI nơi tập cuốc `finding_driver` thay đổi: tạo, nhận, huỷ, hết hạn. */
    public static function flush(): void
    {
        // Redis INCR tự tạo key ở 1 nếu chưa có, nên không cần khởi tạo trước.
        // Bọc try: cache hỏng không được phép làm chết luồng đặt/nhận cuốc.
        try {
            Cache::increment(self::VERSION_KEY);
        } catch (\Throwable) {
            // bỏ qua — lần đọc sau cùng lắm là dùng dữ liệu cũ tối đa TTL giây
        }
    }

    private static function key(array $vehicleTypes, bool $driverIsVip): string
    {
        sort($vehicleTypes);

        return 'trips:available:v'.self::version()
            .':'.implode(',', $vehicleTypes)
            .($driverIsVip ? ':vip' : '');
    }

    private static function version(): int
    {
        try {
            return (int) (Cache::get(self::VERSION_KEY) ?? 1);
        } catch (\Throwable) {
            return 1;
        }
    }
}
