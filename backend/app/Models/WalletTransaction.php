<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class WalletTransaction extends Model
{
    protected $fillable = ['wallet_id', 'booking_id', 'type', 'description', 'points'];

    public function wallet() { return $this->belongsTo(Wallet::class); }
    public function booking() { return $this->belongsTo(Booking::class); }
}
