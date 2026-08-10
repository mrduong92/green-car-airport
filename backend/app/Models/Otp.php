<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Otp extends Model
{
    protected $fillable = [
        'phone',
        'code',
        'expires_at',
        'used_at',
        'verified_at',
        'client_req_id',
        'tracking_id',
        'delivery_status',
        'delivered_at',
    ];

    protected $casts = [
        'expires_at'   => 'datetime',
        'used_at'      => 'datetime',
        'verified_at'  => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function scopeValid($query)
    {
        return $query->whereNull('used_at')->where('expires_at', '>', now());
    }
}

