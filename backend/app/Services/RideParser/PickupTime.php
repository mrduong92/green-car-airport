<?php

namespace App\Services\RideParser;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

// Port zalo-service/src/parser/time.ts resolvePickupAt. Trả mốc UTC.
class PickupTime
{
    private const TZ = 'Asia/Ho_Chi_Minh';

    // Ngày ghi rõ chỉ đổi năm khi tháng "quấn" qua mốc năm (đăng 11–12 mà ghi tháng 1–2 → năm sau, và ngược lại).
    private const YEAR_WRAP_MONTHS = 10;

    public static function resolve(CarbonInterface $postedAt, int $hour, int $minute, ?int $day, ?int $month): Carbon
    {
        $local = Carbon::instance($postedAt)->setTimezone(self::TZ);
        $year = $local->year;
        $m = $month ?? $local->month;
        $d = $day ?? $local->day;

        if ($day !== null && $month !== null) {
            if ($local->month - $m >= self::YEAR_WRAP_MONTHS) {
                $year++;
            } elseif ($m - $local->month >= self::YEAR_WRAP_MONTHS) {
                $year--;
            }
        }

        $candidate = Carbon::create($year, $m, $d, $hour, $minute, 0, self::TZ);
        // Giờ đã qua → hôm sau. Cả khi ngày ghi đúng bằng ngày đăng: AI hay tự điền pickup_date = hôm nay
        // dù tin không ghi ngày ("đón T2 9h" đăng lúc 10:00 là 9h sáng mai).
        $sameDay = $day === null || $local->isSameDay($candidate);
        if ($sameDay && $candidate->lt($local->copy()->subMinutes(30))) {
            $candidate->addDay();
        }

        return $candidate->utc();
    }
}
