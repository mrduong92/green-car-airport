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
        if ($day === null && $candidate->lt($local->copy()->subMinutes(30))) {
            $candidate->addDay(); // giờ đã qua → hôm sau
        }

        return $candidate->utc();
    }
}
