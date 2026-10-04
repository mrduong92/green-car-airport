<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloGroup extends Model
{
    protected $guarded = [];

    protected $casts = ['enabled' => 'boolean', 'last_message_at' => 'datetime', 'messages_24h' => 'integer'];
}
