<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FreeRide extends Model
{
    protected $guarded = [];

    protected $casts = [
        'pickup_at' => 'datetime',
        'posted_at' => 'datetime',
        'expires_at' => 'datetime',
        'is_free' => 'boolean',
        'is_raw' => 'boolean',
        'seats' => 'integer',
        'price' => 'integer',
        'group_count' => 'integer',
    ];
}
