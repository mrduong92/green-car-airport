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

    public function booking()
    {
        return $this->belongsTo(Booking::class);
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
