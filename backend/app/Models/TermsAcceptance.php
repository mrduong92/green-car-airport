<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TermsAcceptance extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'version', 'ip', 'user_agent', 'accepted_at'];

    protected $casts = [
        'accepted_at' => 'datetime',
    ];
}
