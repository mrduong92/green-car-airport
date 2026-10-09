<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('bookings:expire')->hourly();

// Bảng notifications chỉ phình chứ không tự co. Chạy lúc 3h sáng cho khỏi đụng
// giờ cao điểm, và trước job backup DB lúc 3h15 để bản backup nhẹ hơn.
Schedule::command('notifications:prune')->dailyAt('03:00');

// Cuốc Free (microservice Zalo): xoá cuốc hết hạn quá 8 ngày (giữ đủ tuần cho thống kê admin).
Schedule::command('zalo:prune-rides')->dailyAt('03:10');

// Giai đoạn 5: yêu cầu đăng nhập/gỡ nick Zalo bị bỏ dở (service crash, mất mạng...) quá 10
// phút → expired. Cũng xảy ra lazily mỗi khi đọc, lệnh này dọn cả khi không ai đang đọc.
Schedule::command('zalo:expire-account-requests')->everyMinute();
