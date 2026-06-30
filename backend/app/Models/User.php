<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, Notifiable, HasApiTokens;

    protected $fillable = [
        'name', 'phone', 'role', 'password', 'pending_penalty', 'is_blocked',
        'is_collaborator',
        'referral_code', 'referred_by_user_id', 'referral_rewarded_at',
    ];

    protected $hidden = ['password'];

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            if (! $user->referral_code) {
                do {
                    $code = config('app.code_prefix') . '-' . strtoupper(Str::random(6));
                } while (static::where('referral_code', $code)->exists());
                $user->referral_code = $code;
            }
        });
    }

    public function referredBy()
    {
        return $this->belongsTo(User::class, 'referred_by_user_id');
    }

    public function driverProfile()
    {
        return $this->hasOne(DriverProfile::class);
    }

    public function wallet()
    {
        return $this->hasOne(Wallet::class);
    }

    public function bookingsAsCustomer()
    {
        return $this->hasMany(Booking::class, 'customer_id');
    }

    public function bookingsAsDriver()
    {
        return $this->hasMany(Booking::class, 'driver_id');
    }
}
