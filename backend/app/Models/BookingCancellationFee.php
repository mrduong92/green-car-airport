<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Phí app app thực giữ lại (có dấu) khi khách huỷ / hệ thống gỡ một cuốc đã nhận — xem migration
 * 2026_10_19_000006. Tài xế tự bỏ cuốc ghi ở BookingDriverCancellation::forfeited_fee_points.
 */
class BookingCancellationFee extends Model
{
    public $timestamps = false;

    protected $fillable = ['booking_id', 'driver_id', 'cancelled_by', 'kept_fee_points', 'cancelled_at'];

    protected $casts = [
        'cancelled_at' => 'datetime',
        'kept_fee_points' => 'integer',
    ];

    /** Ghi số refundAcceptCharges() trả về — bỏ qua khi bằng 0 (hoàn đủ, app không giữ/lỗ gì). */
    public static function record(Booking $booking, ?int $driverId, string $cancelledBy, int $keptPoints): void
    {
        if ($keptPoints === 0) {
            return;
        }

        static::create([
            'booking_id' => $booking->id,
            'driver_id' => $driverId,
            'cancelled_by' => $cancelledBy,
            'kept_fee_points' => $keptPoints,
            'cancelled_at' => now(),
        ]);
    }

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }
}
