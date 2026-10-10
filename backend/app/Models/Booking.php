<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'customer_id','driver_id','voucher_id','pickup','pickup_lat','pickup_lng',
        'destination','destination_lat','destination_lng',
        'date','time','distance_km','price','discount','surcharge',
        'collection_fee','collaborator_id','held_points',
        'status','vehicle_type','is_vip',
        'cancelled_at','cancelled_by','cancel_reason','accepted_at','note',
    ];
    protected $casts = [
        'cancelled_at' => 'datetime',
        'accepted_at'  => 'datetime',
        'is_vip'       => 'boolean',
        'held_points'  => 'integer',
    ];

    public function customer() { return $this->belongsTo(User::class, 'customer_id'); }
    public function driver()   { return $this->belongsTo(User::class, 'driver_id'); }
    public function voucher()  { return $this->belongsTo(Voucher::class); }
    public function collaborator() { return $this->belongsTo(User::class, 'collaborator_id'); }

    /** Điểm thu hộ tài xế phải nộp lại (1 điểm = 1.000đ). Chỉ cuốc của CTV mới có thu hộ. */
    public function collectionPoints(): int
    {
        return $this->collaborator_id && $this->collection_fee > 0
            ? (int) round($this->collection_fee / 1000)
            : 0;
    }

    /**
     * Hoàn cho tài xế đang giữ cuốc số điểm thu hộ + phí phạt đã tạm giữ lúc nhận
     * (cuốc bị huỷ thì tài xế không thu được đồng nào của khách). Gọi trong
     * transaction của luồng huỷ; phí app hoàn hay không là việc của từng luồng.
     */
    public function releaseHeldPoints(string $cancelledBy): void
    {
        if ($this->held_points <= 0 || ! $this->driver_id) {
            return;
        }

        $wallet = Wallet::firstOrCreate(['user_id' => $this->driver_id], ['points' => 0]);
        $wallet->increment('points', $this->held_points);
        WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'booking_id' => $this->id,
            'type' => 'credit',
            'description' => "Hoàn thu hộ/phí phạt tạm giữ cuốc #{$this->id} ({$cancelledBy} huỷ)",
            'points' => $this->held_points,
        ]);

        $this->update(['held_points' => 0]);
    }

    /** Điểm phí phạt huỷ (của khách, cộng vào cuốc này) tài xế thu hộ công ty. */
    public function surchargePoints(): int
    {
        return $this->surcharge > 0 ? (int) round($this->surcharge / 1000) : 0;
    }
}
