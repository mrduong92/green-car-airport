<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
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

    // Hai bản cùng người được coi là một cuốc khi giờ đón lệch nhau không quá chừng này.
    public const MERGE_WINDOW_MINUTES = 30;

    // Bản trùng (cùng người, cùng nội dung, nick phụ khác nghe được) trỏ về cuốc gốc qua duplicate_of_id.
    public function duplicates(): HasMany
    {
        return $this->hasMany(self::class, 'duplicate_of_id');
    }

    /**
     * group_count hiển thị = group_count của cuốc + tổng group_count các bản trùng (tính lúc đọc,
     * không lưu sẵn) — bản trùng được service gửi lại tăng group_count thì tự phản ánh ngay.
     * Dùng kèm displayedGroupCount().
     */
    public function scopeWithMergedGroupCount(Builder $query): Builder
    {
        return $query->withSum('duplicates', 'group_count');
    }

    public function displayedGroupCount(): int
    {
        return $this->group_count + (int) ($this->duplicates_sum_group_count ?? 0);
    }

    /**
     * Cùng người (qr_code) VÀ cùng nội dung: cùng số chỗ, cùng chiều, cùng điểm đón/điểm đến (đã chuẩn hoá),
     * giờ đón lệch ≤ MERGE_WINDOW_MINUTES (cả hai không ghi giờ cũng tính là bằng). Cuốc nguyên văn
     * (is_raw) thì so raw_text đã chuẩn hoá. Người khác nhau thì KHÔNG bao giờ gộp.
     */
    public function sameRideAs(self $other): bool
    {
        // Số chỗ phải bằng nhau (cả hai null cũng tính là bằng) — nếu không, bản gốc bị lọc theo
        // số chỗ sẽ kéo theo mất luôn bản trùng khớp bộ lọc ở tab Free / cảnh báo đẩy.
        if ($this->qr_code !== $other->qr_code || $this->is_raw !== $other->is_raw || $this->seats !== $other->seats) {
            return false;
        }
        if ($this->is_raw) {
            return self::normalize($this->raw_text) === self::normalize($other->raw_text);
        }
        if ($this->direction !== $other->direction
            || self::normalize($this->pickup) !== self::normalize($other->pickup)
            || self::normalize($this->destination) !== self::normalize($other->destination)) {
            return false;
        }
        if ($this->pickup_at === null || $other->pickup_at === null) {
            return $this->pickup_at === null && $other->pickup_at === null;
        }

        return abs($this->pickup_at->getTimestamp() - $other->pickup_at->getTimestamp()) <= self::MERGE_WINDOW_MINUTES * 60;
    }

    // Chữ thường, bỏ khoảng trắng đầu/cuối, gộp khoảng trắng liên tiếp.
    public static function normalize(?string $text): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', (string) $text)));
    }

    /**
     * Điều kiện hiển thị dùng chung cho tab Free (FreeRideController::index) VÀ job cảnh báo đẩy
     * (NotifyFreeRideAlerts): còn hạn, không bị chặn/ẩn người bắn (theo qr_code hoặc sender_uid), nhóm chưa bị admin tắt, cùng các
     * bộ lọc tuỳ chọn direction/seats/q (q khớp LIKE trên pickup/destination/raw_text) và window.
     *
     * Bản trùng (duplicate_of_id) bị ẩn khi cuốc gốc còn hiển thị được (còn hạn, nhóm chưa tắt);
     * cuốc gốc hết hạn / bị xoá / nhóm bị tắt thì bản trùng hiện lại — không để cuốc biến mất.
     */
    public function scopeVisibleTo(Builder $query, int $driverId, array $data = []): Builder
    {
        // Chặn/ẩn khoá theo qr_code (hồ sơ — áp lên mọi uid của cùng người, vì Zalo cấp uid khác
        // nhau tuỳ nick phụ) HOẶC theo sender_uid (hàng cũ). whereNotNull bắt buộc: NOT IN gặp NULL
        // trong subquery sẽ cho UNKNOWN và loại sạch mọi cuốc.
        $hidden = DriverHiddenSender::where('driver_id', $driverId);
        $query->where('expires_at', '>', now())
            ->whereNotIn('qr_code', ZaloSenderBlock::whereNotNull('qr_code')->select('qr_code'))
            ->whereNotIn('sender_uid', ZaloSenderBlock::whereNotNull('sender_uid')->select('sender_uid'))
            // Nhóm admin đã tắt: ẩn cả cuốc đã đồng bộ trước khi tắt / lúc service chưa lấy được cấu hình.
            ->whereNotIn('zalo_group_id', ZaloGroup::where('enabled', false)->select('zalo_group_id'))
            ->whereNotIn('qr_code', (clone $hidden)->whereNotNull('qr_code')->select('qr_code'))
            ->whereNotIn('sender_uid', (clone $hidden)->whereNotNull('sender_uid')->select('sender_uid'))
            ->where(fn (Builder $w) => $w->whereNull('duplicate_of_id')
                ->orWhereNotIn('duplicate_of_id', self::query()->where('expires_at', '>', now())
                    ->whereNotIn('zalo_group_id', ZaloGroup::where('enabled', false)->select('zalo_group_id'))
                    ->select('id')))
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
