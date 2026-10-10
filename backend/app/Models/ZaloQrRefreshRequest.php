<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloQrRefreshRequest extends Model
{
    protected $guarded = [];

    protected $casts = ['delivered_at' => 'datetime'];
}
