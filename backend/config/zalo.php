<?php

// Microservice Zalo (Cuốc Free) — Laravel chỉ làm phần nhẹ: nhận dữ liệu đã xử lý từ
// service Node + giám sát. Spec: docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md
return [
    // Công tắc tắt nhanh mọi endpoint /api/internal/zalo/* (trả 503) mà không cần deploy.
    'enabled' => (bool) env('ZALO_SERVICE_ENABLED', false),

    // Khoá HMAC dùng chung với service. Rỗng = từ chối mọi request.
    'bot_secret' => env('ZALO_BOT_SECRET', ''),

    'max_clock_skew_seconds' => 300,

    // Giám sát (zalo:service-status)
    'heartbeat_stale_seconds' => 180,
    'silence_alert_minutes' => 10,
    // Ngoài khung giờ này nhóm vắng là bình thường — không cảnh báo im lặng.
    // Tính theo giờ Việt Nam: app chạy timezone UTC (config/app.php).
    'active_hours' => [5, 23],
    'timezone' => 'Asia/Ho_Chi_Minh',

    // Service im quá số ngày này thì bỏ khỏi danh sách theo dõi (đổi SERVICE_ID, ngừng service).
    'forget_after_days' => 7,

    // Giai đoạn 2
    'max_rides_batch' => 100,
];
