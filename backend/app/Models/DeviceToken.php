<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DeviceToken extends Model
{
    protected $fillable = ['user_id', 'endpoint', 'p256dh', 'auth', 'platform', 'last_used_at'];

    public function user() { return $this->belongsTo(User::class); }
}
