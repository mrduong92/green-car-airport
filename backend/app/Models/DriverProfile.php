<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class DriverProfile extends Model
{
    protected $fillable = [
        'user_id','vehicle_make','vehicle_model','vehicle_plate',
        'vehicle_year','vehicle_color','status','is_verified','is_online',
        'rating','trips_count','months_active',
    ];
    protected $casts = ['is_verified' => 'boolean', 'is_online' => 'boolean'];

    public function user() { return $this->belongsTo(User::class); }
}
