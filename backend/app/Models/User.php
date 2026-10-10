<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Http\Request;
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

    protected $casts = [
        'is_blocked'      => 'boolean',
        'is_collaborator' => 'boolean',
    ];

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

    public function termsAcceptances()
    {
        return $this->hasMany(TermsAcceptance::class);
    }

    /** Khách/tài xế chưa đồng ý phiên bản điều khoản hiện hành. Admin không bị hỏi. */
    public function needsTermsAcceptance(): bool
    {
        if ($this->role === 'admin') return false;

        return ! $this->termsAcceptances()->where('version', config('terms.version'))->exists();
    }

    public function acceptTerms(Request $request): void
    {
        $this->termsAcceptances()->create([
            'version'     => config('terms.version'),
            'ip'          => $request->ip(),
            'user_agent'  => Str::limit((string) $request->userAgent(), 500, ''),
            'accepted_at' => now(),
        ]);
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
