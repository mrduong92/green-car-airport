<?php

namespace App\Support;

use App\Models\BookingCancellationFee;
use App\Models\BookingDriverCancellation;
use Illuminate\Support\Carbon;

/**
 * Phí app app giữ lại từ cuốc KHÔNG hoàn thành, theo ngày huỷ (cancelled_at): tài xế tự bỏ
 * (booking_driver_cancellations.forfeited_fee_points) + khách huỷ / hệ thống gỡ
 * (booking_cancellation_fees.kept_fee_points). Nguồn DUY NHẤT cho Doanh thu và Dashboard —
 * cộng với phí giữ lại của cuốc hoàn thành (Booking::keptAppFeeVndSql(), theo completed_at).
 */
final class CancelledTripFees
{
    public const VND_PER_POINT = 1000;

    /** model => cột điểm (có dấu); cả hai bảng đều có cancelled_at. */
    private const SOURCES = [
        BookingDriverCancellation::class => 'forfeited_fee_points',
        BookingCancellationFee::class => 'kept_fee_points',
    ];

    public static function vndBetween(Carbon $from, Carbon $to): int
    {
        $points = 0;
        foreach (self::SOURCES as $model => $column) {
            $points += (int) $model::whereBetween('cancelled_at', [$from, $to])->sum($column);
        }

        return $points * self::VND_PER_POINT;
    }

    /**
     * Như vndBetween() nhưng gom theo $bucketSql — biểu thức trên cột `cancelled_at`, cùng dạng
     * khoá với biểu đồ (DATE(...) / SUBSTR(..., 1, 13)). Trả về [khoá => VNĐ].
     *
     * @return array<string, int>
     */
    public static function vndByBucket(Carbon $from, Carbon $to, string $bucketSql): array
    {
        $byBucket = [];
        foreach (self::SOURCES as $model => $column) {
            $rows = $model::whereBetween('cancelled_at', [$from, $to])
                ->selectRaw("{$bucketSql} as bucket, SUM({$column}) as points")
                ->groupByRaw($bucketSql)
                ->get();
            foreach ($rows as $r) {
                $byBucket[$r->bucket] = ($byBucket[$r->bucket] ?? 0) + (int) $r->points * self::VND_PER_POINT;
            }
        }

        return $byBucket;
    }

    /** VNĐ tài xế thực mất khi bỏ một cuốc — hiển thị ở lịch sử tài xế, không âm. */
    public static function driverLossVnd(BookingDriverCancellation $drop): int
    {
        return max(0, (int) $drop->forfeited_fee_points) * self::VND_PER_POINT;
    }
}
