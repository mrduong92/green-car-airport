<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class CampaignGrant extends Model
{
    // Bảng không có created_at/updated_at — chỉ có granted_at (xem migration).
    public $timestamps = false;

    protected $fillable = ['campaign_id', 'user_id', 'phone', 'granted_at'];
    protected $casts = ['granted_at' => 'datetime'];

    public function campaign() { return $this->belongsTo(Campaign::class); }
    public function user() { return $this->belongsTo(User::class); }
}
