<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'customer_id', 'driver_id', 'voucher_id', 'pickup', 'pickup_lat', 'pickup_lng',
        'destination', 'destination_lat', 'destination_lng',
        'date', 'time', 'distance_km', 'price', 'discount', 'surcharge',
        'collection_fee', 'collaborator_id',
        'charged_fee_points', 'held_collection_points', 'held_surcharge_points', 'held_shortfall_points', 'waived_fee_points',
        'points_used', 'cashback_points', 'commission_points', 'points_refunded_at',
        'status', 'vehicle_type',
        'cancelled_at', 'cancelled_by', 'cancel_reason', 'accepted_at', 'completed_at', 'note',
    ];

    protected $casts = [
        'cancelled_at' => 'datetime',
        'accepted_at' => 'datetime',
        'completed_at' => 'datetime',
        'charged_fee_points' => 'integer',
        'held_collection_points' => 'integer',
        'held_surcharge_points' => 'integer',
        'held_shortfall_points' => 'integer',
        'waived_fee_points' => 'integer',
        'points_used' => 'integer',
        'cashback_points' => 'integer',
        'commission_points' => 'integer',
        'points_refunded_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function driver()
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function voucher()
    {
        return $this->belongsTo(Voucher::class);
    }

    public function collaborator()
    {
        return $this->belongsTo(User::class, 'collaborator_id');
    }

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

    /** Giá cơ sở cho phí app, hoàn điểm, hoa hồng: giá sau voucher (không gồm phụ phí phạt, thu hộ). */
    public function basePrice(): int
    {
        return (int) $this->price - (int) $this->discount;
    }

    public function pointsDiscountVnd(): int
    {
        return (int) $this->points_used * 1000;
    }

    /**
     * points_used HIỂN THỊ: cuốc đã bị hoàn điểm (khách/hệ thống huỷ, hết hạn…)
     * thì coi như chưa từng dùng điểm — khách không còn được giảm giá, tài xế
     * không còn được app bù. Cột `points_used` trong DB giữ nguyên (lịch sử/đối
     * soát), hàm này chỉ dùng cho MỌI nơi hiển thị ra ngoài: formatBooking (khách)
     * và formatTrip (tài xế) đều gọi hàm này thay vì đọc thẳng points_used.
     */
    public function effectivePointsUsed(): int
    {
        return $this->points_refunded_at !== null ? 0 : (int) $this->points_used;
    }

    /** VNĐ giảm giá hiển thị tương ứng effectivePointsUsed() — 0 nếu điểm đã được hoàn. */
    public function effectivePointsDiscountVnd(): int
    {
        return $this->effectivePointsUsed() * 1000;
    }

    /** Số tiền khách trả tài xế. Nguồn DUY NHẤT — formatBooking, formatTrip đều gọi. */
    public function finalPrice(): int
    {
        return $this->basePrice() - $this->pointsDiscountVnd() + (int) $this->surcharge + (int) ($this->collection_fee ?? 0);
    }

    /**
     * Phí app trừ tài xế lúc nhận cuốc: phí trừ đi số điểm khách dùng (app bù) — tài xế thu ít
     * tiền mặt hơn đúng chừng đó nên vẫn nhận đủ phần trăm giá cơ sở của mình. Khi tỉ lệ phí
     * còn cao hơn trần dùng điểm (vd phí 20% > trần điểm 10%) thì points_used luôn ≤ phí nên
     * kết quả không bao giờ âm.
     *
     * ⚠️ Nếu ADMIN HẠ tỉ lệ phí (`app_fee_percent`) XUỐNG DƯỚI trần dùng điểm SAU khi khách đã
     * giữ điểm theo trần cũ, points_used có thể VƯỢT appFeePoints() — hàm này clamp về 0 nên
     * không âm, nhưng phần vượt (points_used − appFeePoints) không được trừ ở đây: tài xế sẽ bị
     * thiếu đúng phần đó nếu không bù thêm. Driver/TripController::accept() tính riêng phần vượt
     * này ("shortfall") và CỘNG thẳng vào ví tài xế (held_shortfall_points) ngay lúc nhận, để tài
     * xế luôn nhận đủ (100% − feeRate) của basePrice() bất kể phí bị hạ sau khi điểm đã giữ.
     * refundAcceptCharges() thu hồi đúng số đã cộng này nếu cuốc không hoàn tất.
     */
    public function driverFeePoints(float $feeRate): int
    {
        return max(0, $this->appFeePoints($feeRate) - (int) $this->points_used);
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
     * luôn hoàn thu hộ + phí phạt tạm giữ; phí app chỉ hoàn khi $refundFee. Khi KHÔNG hoàn
     * phí (tài xế tự bỏ cuốc) thì trừ thêm phần phí đã miễn nhờ điểm khách (waived_fee_points)
     * để tài xế mất đủ phí app lúc nhận.
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

        $cleared = [
            'charged_fee_points' => null, 'held_collection_points' => 0,
            'held_surcharge_points' => 0, 'held_shortfall_points' => 0, 'waived_fee_points' => 0,
        ];
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
        // Thu lại phần app đã bù thêm lúc nhận (xem driverFeePoints()), BẤT KỂ $refundFee:
        // cuốc không hoàn tất thì khoản bù — vốn chỉ có ý nghĩa nếu tài xế thực sự chạy
        // xong cuốc đó — không còn lý do tồn tại. Khách huỷ: tài xế về ĐÚNG số dư trước
        // khi nhận (cùng charged_fee_points/held_* được hoàn ở trên, cộng trừ bằng 0).
        // Tài xế tự bỏ cuốc: không hoàn phí ĐÃ trừ, nhưng khoản bù vẫn phải thu lại —
        // nếu không, cuốc quay lại sàn và tài xế SAU nhận lại sẽ được bù một lần nữa
        // (app trả 2 lần bù cho 1 cuốc).
        //
        // ⚠️ Tài xế có thể đã TIÊU số điểm bù này (vd nhận cuốc khác) trước khi cuốc này
        // bị bỏ/huỷ — `points` là UNSIGNED nên trừ vượt số dư sẽ nổ SQL (strict mode) và
        // cuốn theo cả transaction huỷ/bỏ cuốc (tài xế không bỏ được cuốc). Chỉ thu lại
        // TỐI ĐA số dư hiện có; phần không thu được coi như mất, ghi rõ vào mô tả giao
        // dịch để đối soát — không truy thu thêm ở nơi khác.
        if ($this->held_shortfall_points > 0) {
            $clawback = min($wallet->points, $this->held_shortfall_points);
            if ($clawback > 0) {
                $description = $clawback < $this->held_shortfall_points
                    ? "Thu lại phần app bù cuốc #{$this->id} (thiếu ".($this->held_shortfall_points - $clawback).' điểm, bỏ qua)'
                    : "Thu lại phần app bù điểm cuốc #{$this->id} ({$cancelledBy} huỷ, cuốc không hoàn tất)";
                $wallet->debit($clawback, $description, $this->id);
            }
        }

        // Tài xế TỰ BỎ cuốc mất ĐỦ phí app tại tỉ lệ lúc nhận (quyết định "mất đủ 20%"):
        // lúc nhận chỉ trừ charged_fee_points = phí − điểm khách dùng, nên trừ thêm phần
        // đã miễn (waived_fee_points = min(phí, điểm)). Cộng với shortfall đã thu lại ở
        // trên, tổng tài xế mất = charged + waived = đúng phí lúc nhận, không hơn. Khách /
        // hệ thống huỷ ($refundFee) thì không trừ — tài xế được hoàn hết.
        // Như shortfall: chỉ trừ TỐI ĐA số dư hiện có (`points` UNSIGNED), phần thiếu bỏ qua
        // và ghi vào mô tả để đối soát.
        if (! $refundFee && $this->waived_fee_points > 0) {
            $forfeit = min($wallet->points, $this->waived_fee_points);
            if ($forfeit > 0) {
                $description = $forfeit < $this->waived_fee_points
                    ? "Thu phần phí app đã miễn nhờ điểm khách dùng cuốc #{$this->id} (thiếu ".($this->waived_fee_points - $forfeit).' điểm, bỏ qua)'
                    : "Thu phần phí app đã miễn nhờ điểm khách dùng cuốc #{$this->id} ({$cancelledBy} bỏ cuốc, mất đủ phí app)";
                $wallet->debit($forfeit, $description, $this->id);
            }
        }

        $this->forceFill($cleared)->syncOriginal();
    }
}
