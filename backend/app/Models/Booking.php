<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'customer_id','driver_id','voucher_id','pickup','pickup_lat','pickup_lng',
        'destination','destination_lat','destination_lng',
        'date','time','distance_km','price','discount','surcharge','status','vehicle_type',
        'cancelled_at','cancelled_by','note',
    ];
    protected $casts = ['cancelled_at' => 'datetime'];

    public function customer() { return $this->belongsTo(User::class, 'customer_id'); }
    public function driver()   { return $this->belongsTo(User::class, 'driver_id'); }
    public function voucher()  { return $this->belongsTo(Voucher::class); }
}
