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
