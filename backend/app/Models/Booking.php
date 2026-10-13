<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'customer_id','driver_id','voucher_id','pickup','pickup_lat','pickup_lng',
        'destination','destination_lat','destination_lng',
        'date','time','distance_km','price','discount','surcharge',
        'collection_fee','collaborator_id',
        'charged_fee_points','held_collection_points','held_surcharge_points',
        'status','vehicle_type','is_vip',
        'cancelled_at','cancelled_by','cancel_reason','accepted_at','note',
    ];
    protected $casts = [
        'cancelled_at' => 'datetime',
        'accepted_at'  => 'datetime',
        'is_vip'       => 'boolean',
        'charged_fee_points'     => 'integer',
        'held_collection_points' => 'integer',
        'held_surcharge_points'  => 'integer',
    ];

    public function customer() { return $this->belongsTo(User::class, 'customer_id'); }
    public function driver()   { return $this->belongsTo(User::class, 'driver_id'); }
    public function voucher()  { return $this->belongsTo(Voucher::class); }
    public function collaborator() { return $this->belongsTo(User::class, 'collaborator_id'); }

    /**
     * Điểm phí app của cuốc theo tỉ lệ đang áp dụng. Chỉ phí trên giá cuốc sau
     * voucher, KHÔNG gộp thu hộ. Nguồn DUY NHẤT của công thức — accept(), thẻ cuốc
     * và hoàn phí cuốc cũ đều gọi hàm này. Nhận tỉ lệ từ ngoài để danh sách cuốc
     * không query app_settings cho từng dòng.
     */
    public function appFeePoints(float $feeRate): int
    {
        return (int) round(($this->price - $this->discount) * $feeRate / 1000);
    }

    /** Điểm thu hộ tài xế phải nộp lại (1 điểm = 1.000đ). Chỉ cuốc của CTV mới có thu hộ. */
    public function collectionPoints(): int
    {
        return $this->collaborator_id && $this->collection_fee > 0
            ? (int) round($this->collection_fee / 1000)
            : 0;
    }

    /** Điểm phí phạt huỷ (của khách, cộng vào cuốc này) tài xế thu hộ công ty. */
    public function surchargePoints(): int
    {
        return $this->surcharge > 0 ? (int) round($this->surcharge / 1000) : 0;
    }

    /** Cuốc đã đi qua luồng trừ-lúc-nhận (có ghi số đã trừ) — khác cuốc nhận trước bản này. */
    public function chargedOnAccept(): bool
    {
        return $this->charged_fee_points !== null;
    }

    /**
     * Hoàn cho tài xế các khoản ĐÃ trừ lúc nhận (theo đúng số đã ghi, không tính lại):
     * luôn hoàn thu hộ + phí phạt tạm giữ; phí app chỉ hoàn khi $refundFee.
     *
     * ⚠️ Gọi trên bản ghi vừa `lockForUpdate()` trong transaction của luồng huỷ.
     * Ngoài khoá dòng còn một chốt nữa: chỉ lời gọi nào xoá được dấu "đã trừ"
     * (UPDATE … WHERE charged_fee_points IS NOT NULL) mới được hoàn — gọi lại trên
     * một bản cũ trong bộ nhớ sẽ không hoàn lần hai.
     */
    public function refundAcceptCharges(string $cancelledBy, bool $refundFee): void
    {
        if (! $this->chargedOnAccept() || ! $this->driver_id) {
            return;
        }

        $cleared = ['charged_fee_points' => null, 'held_collection_points' => 0, 'held_surcharge_points' => 0];
        $claimed = static::whereKey($this->id)->whereNotNull('charged_fee_points')->update($cleared);
        if ($claimed === 0) {
            return;
        }

        $wallet = Wallet::lockedFor($this->driver_id);
        $wallet->credit(
            $this->held_collection_points + $this->held_surcharge_points,
            "Hoàn thu hộ/phí phạt tạm giữ cuốc #{$this->id} ({$cancelledBy} huỷ)",
            $this->id,
        );
        if ($refundFee) {
            $wallet->credit($this->charged_fee_points, "Hoàn phí app cuốc #{$this->id} ({$cancelledBy} huỷ)", $this->id);
        }

        $this->forceFill($cleared)->syncOriginal();
    }
}
