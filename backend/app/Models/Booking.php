<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'customer_id','driver_id','voucher_id','pickup','destination',
        'date','time','distance_km','price','discount','status','cancelled_at',
    ];
    protected $casts = ['cancelled_at' => 'datetime', 'date' => 'date'];

    public function customer() { return $this->belongsTo(User::class, 'customer_id'); }
    public function driver()   { return $this->belongsTo(User::class, 'driver_id'); }
    public function voucher()  { return $this->belongsTo(Voucher::class); }
}
