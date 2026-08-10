<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PriceConfig extends Model
{
    protected $fillable = [
        'service_type',
        'trip_type',
        'vehicle_type',
        'is_vip',
        'price_type',
        'min_price',
        'max_price',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_vip'    => 'boolean',
    ];
}
