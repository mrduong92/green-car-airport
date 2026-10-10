<?php

namespace App\Console\Commands;

use App\Models\ZaloAccountRequest;
use Illuminate\Console\Command;

// Dọn yêu cầu đăng nhập/gỡ nick Zalo bị bỏ dở (service crash, mất mạng, admin đóng tab giữa
// chừng...) quá 10 phút không có tiến triển — đánh expired + xoá ảnh QR nhạy cảm. Việc này
// cũng xảy ra lazily mỗi khi đọc danh sách (ZaloAccountRequest::expireStale()); lệnh này chạy
// định kỳ để dọn cả khi không ai đang đọc (service không hỏi vì không còn yêu cầu pending,
// admin không mở trang).
class ExpireZaloAccountRequests extends Command
{
    protected $signature = 'zalo:expire-account-requests';

    protected $description = 'Đánh dấu hết hạn các yêu cầu đăng nhập/gỡ nick Zalo quá 10 phút chưa xử lý xong';

    public function handle(): int
    {
        ZaloAccountRequest::expireStale();

        return self::SUCCESS;
    }
}
