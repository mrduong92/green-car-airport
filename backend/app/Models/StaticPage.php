<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaticPage extends Model
{
    protected $fillable = ['slug', 'title', 'content', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
