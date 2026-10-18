<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DriverProfile extends Model
{
    protected $fillable = [
        'user_id','vehicle_make','vehicle_model','vehicle_plate','vehicle_year',
        'vehicle_color','vehicle_type','white_plate','status','blocked_reason','is_verified','is_online',
        'latitude','longitude','payment_code','months_active','rating','trips_count',
        'cccd_number','gplx_number','vehicle_reg_number',
        'vehicle_inspection_number','vehicle_inspection_expiry',
        'insurance_number','insurance_expiry','free_unlocked_until',
    ];
    protected $casts = [
        'is_verified'               => 'boolean',
        'is_online'                 => 'boolean',
        'white_plate'               => 'boolean',
        'free_unlocked_until'       => 'datetime',
        'vehicle_inspection_expiry' => 'date',
        'insurance_expiry'          => 'date',
    ];

    protected static function booted(): void
    {
        static::creating(function (DriverProfile $profile) {
            if (! $profile->payment_code && $profile->user_id) {
                $profile->payment_code = config('app.code_prefix') . str_pad((string) $profile->user_id, 6, '0', STR_PAD_LEFT);
            }
        });
    }

    /** Còn hạn mở khóa Nhận cuốc ở tab Free (admin duyệt tay, 1 năm). */
    public function hasFreeAccess(): bool
    {
        return $this->free_unlocked_until !== null && $this->free_unlocked_until->isFuture();
    }

    public function user() { return $this->belongsTo(User::class); }
}
