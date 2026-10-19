<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingDriverCancellation extends Model
{
    public $timestamps = false;

    protected $fillable = ['booking_id', 'driver_id', 'reason', 'forfeited_fee_points', 'cancelled_at'];

    protected $casts = [
        'cancelled_at' => 'datetime',
        'forfeited_fee_points' => 'integer',
    ];

    /** VNĐ phí app app giữ lại từ các lần tài xế bỏ cuốc trong khoảng (theo ngày bỏ). */
    public static function forfeitedFeeVndBetween($from, $to): int
    {
        return (int) static::whereBetween('cancelled_at', [$from, $to])->sum('forfeited_fee_points') * 1000;
    }

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
