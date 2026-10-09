<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class FreeRide extends Model
{
    protected $guarded = [];

    protected $casts = [
        'pickup_at' => 'datetime',
        'posted_at' => 'datetime',
        'expires_at' => 'datetime',
        'is_free' => 'boolean',
        'is_raw' => 'boolean',
        'seats' => 'integer',
        'price' => 'integer',
        'group_count' => 'integer',
    ];

    // Mã QR chỉ gồm chữ/số — giai đoạn 2 đã lọc lúc ingest, đây là lớp phòng thủ cuối (xem filterSafe()).
    private const SAFE_CODE_REGEX = '/^[A-Za-z0-9]+$/';

    private const TZ = 'Asia/Ho_Chi_Minh';

    /**
     * Điều kiện hiển thị dùng chung cho tab Free (FreeRideController::index) VÀ job cảnh báo đẩy
     * (NotifyFreeRideAlerts): còn hạn, không bị chặn/ẩn người bắn, nhóm chưa bị admin tắt, cùng các
     * bộ lọc tuỳ chọn direction/seats/q (q khớp LIKE trên pickup/destination/raw_text) và window.
     */
    public function scopeVisibleTo(Builder $query, int $driverId, array $data = []): Builder
    {
        $query->where('expires_at', '>', now())
            ->whereNotIn('sender_uid', ZaloSenderBlock::select('sender_uid'))
            // Nhóm admin đã tắt: ẩn cả cuốc đã đồng bộ trước khi tắt / lúc service chưa lấy được cấu hình.
            ->whereNotIn('zalo_group_id', ZaloGroup::where('enabled', false)->select('zalo_group_id'))
            ->whereNotIn('sender_uid', DriverHiddenSender::where('driver_id', $driverId)->select('sender_uid'))
            ->when($data['direction'] ?? null, fn (Builder $q, string $d) => $q->where('direction', $d))
            ->when($data['seats'] ?? null, fn (Builder $q, $s) => $q->where('seats', (int) $s));

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn (Builder $w) => $w->where('pickup', 'like', $like)
                ->orWhere('destination', 'like', $like)
                ->orWhere('raw_text', 'like', $like));
        }

        $nowVn = now(self::TZ);
        // Cuốc không ghi giờ hiển thị là "Đi luôn" → tính vào "2 giờ tới" và "Hôm nay" (đã còn hạn ≤ 3 giờ sau khi đăng).
        $orLeavingNow = fn (array $range) => fn (Builder $w) => $w->whereBetween('pickup_at', $range)->orWhereNull('pickup_at');
        match ($data['window'] ?? null) {
            '2h' => $query->where($orLeavingNow([now()->subMinutes(30), now()->addHours(2)])),
            'today' => $query->where($orLeavingNow([now()->subMinutes(30), $nowVn->copy()->endOfDay()->utc()])),
            'tomorrow' => $query->whereBetween('pickup_at', [$nowVn->copy()->addDay()->startOfDay()->utc(), $nowVn->copy()->addDay()->endOfDay()->utc()]),
            default => null,
        };

        return $query;
    }

    // Phòng thủ: loại cuốc có qr_code không phải thuần chữ/số. Lọc ở PHP (không phải DB) để chạy
    // giống nhau trên mọi driver, kể cả SQLite (test) không có REGEXP.
    public static function filterSafe(Collection $rides): Collection
    {
        return $rides->filter(fn (FreeRide $r) => preg_match(self::SAFE_CODE_REGEX, $r->qr_code) === 1);
    }
}
