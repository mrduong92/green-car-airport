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
    'ai_daily_budget_usd' => (float) env('ZALO_AI_DAILY_BUDGET_USD', 5),
    'rides_backlog_alert' => 1000,
    // Cảnh báo khi số cuốc còn hạn bị giữ lại (người bắn chưa có mã QR) vượt ngưỡng này.
    'held_back_alert' => 200,
    // Các lô cuốc ghi tuần tự (khoá zalo:ingest, để id commit đúng thứ tự cho NotifyFreeRideAlerts);
    // chờ khoá quá số giây này thì trả 503, service gửi lại sau.
    'ingest_lock_wait_seconds' => 15,

    // Dọn dữ liệu phụ (zalo:prune-data, 03:20 hằng ngày) — số ngày giữ lại.
    // Yêu cầu thêm/gỡ nick đã kết thúc (done/expired/failed), tính từ lúc tạo.
    'account_requests_retention_days' => (int) env('ZALO_ACCOUNT_REQUESTS_RETENTION_DAYS', 30),
    // Báo cáo cuốc của tài xế (free_ride_reports), tính từ lúc tạo.
    'reports_retention_days' => (int) env('ZALO_REPORTS_RETENTION_DAYS', 90),
    // Yêu cầu lấy lại mã QR ĐÃ giao cho service, tính từ delivered_at.
    'qr_refresh_requests_retention_days' => (int) env('ZALO_QR_REFRESH_REQUESTS_RETENTION_DAYS', 90),
    // Nhóm nick phụ đã rời (zalo_groups.left_at). Service cũng tự xoá nhóm đã rời của nó sau
    // LEFT_GROUP_RETENTION_DAYS (mặc định 30) — nên đặt hai bên bằng nhau.
    'left_groups_retention_days' => (int) env('ZALO_LEFT_GROUPS_RETENTION_DAYS', 30),
];
