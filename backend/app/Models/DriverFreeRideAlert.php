<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DriverFreeRideAlert extends Model
{
    protected $guarded = [];

    protected $casts = [
        'enabled' => 'boolean',
        'seats' => 'integer',
        'last_pushed_at' => 'datetime',
    ];
}
