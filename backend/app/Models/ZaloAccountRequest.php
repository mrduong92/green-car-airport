<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Yêu cầu đăng nhập/gỡ nick Zalo phụ (giai đoạn 5, mục 2 spec). Laravel không gọi vào
// service: service Node hỏi GET /internal/zalo/account-requests, báo tiến độ bằng POST.
class ZaloAccountRequest extends Model
{
    protected $guarded = [];

    protected $casts = [
        'qr_expires_at' => 'datetime',
    ];

    // Yêu cầu còn "mở" — chưa xong (chặn tạo yêu cầu mới cho cùng account_id, service còn cần xử lý).
    public const OPEN_STATUSES = ['pending', 'qr_ready'];

    // Chuyển trạng thái hợp lệ: pending có thể đi thẳng tới done/failed (ví dụ gỡ nick
    // không cần QR); qr_ready có thể lặp lại (QR mới sau khi hết hạn) hoặc kết thúc.
    private const VALID_TRANSITIONS = [
        'qr_ready' => ['pending', 'qr_ready'],
        'done' => ['pending', 'qr_ready'],
        'failed' => ['pending', 'qr_ready'],
        'expired' => ['qr_ready'],
    ];

    public function canTransitionTo(string $status): bool
    {
        return in_array($this->status, self::VALID_TRANSITIONS[$status] ?? [], true);
    }

    // Yêu cầu pending/qr_ready quá 10 phút không có tiến triển gì (updated_at không đổi) coi như
    // service đã bỏ cuộc (crash, mất mạng...) — đánh expired + xoá ảnh QR nhạy cảm.
    public static function expireStale(): void
    {
        static::whereIn('status', self::OPEN_STATUSES)
            ->where('updated_at', '<', now()->subMinutes(10))
            ->update([
                'status' => 'expired',
                'qr_image' => null,
                'error' => 'Quá hạn xử lý (10 phút không có phản hồi từ service)',
                'updated_at' => now(),
            ]);
    }
}
