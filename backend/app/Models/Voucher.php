<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Voucher extends Model
{
    protected $fillable = [
        'code','type','value','target','expires_at','usage_limit','usage_count','is_active',
    ];
    protected $casts = ['is_active' => 'boolean', 'expires_at' => 'date'];

    public function bookings() { return $this->hasMany(Booking::class); }
}
