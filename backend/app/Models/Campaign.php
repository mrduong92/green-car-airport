<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Campaign extends Model
{
    protected $fillable = [
        'name', 'trigger', 'reward', 'conditions',
        'starts_at', 'ends_at', 'max_grants', 'grants_count', 'is_active',
    ];
    protected $casts = [
        'reward'     => 'array',
        'conditions' => 'array',
        'starts_at'  => 'datetime',
        'ends_at'    => 'datetime',
        'is_active'  => 'boolean',
    ];

    public function grants() { return $this->hasMany(CampaignGrant::class); }
    public function vouchers() { return $this->hasMany(Voucher::class); }
}
