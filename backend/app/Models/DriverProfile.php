<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DriverProfile extends Model
{
    protected $fillable = [
        'user_id','payment_code','vehicle_make','vehicle_model','vehicle_plate',
        'vehicle_year','vehicle_color','status','blocked_reason','is_verified','is_online',
        'latitude','longitude','rating','trips_count','months_active',
    ];
    protected $casts = ['is_verified' => 'boolean', 'is_online' => 'boolean'];

    protected static function booted(): void
    {
        static::creating(function (DriverProfile $profile) {
            if (! $profile->payment_code && $profile->user_id) {
                $profile->payment_code = 'GCA' . str_pad((string) $profile->user_id, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    public function user() { return $this->belongsTo(User::class); }
}
