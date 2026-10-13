<?php

// Giá trị mặc định cho các tham số nghiệp vụ mà admin chỉnh được ở trang Cài đặt
// (bảng app_settings ghi đè các giá trị này — xem App\Models\AppSetting).
return [
    // Phí app tính trên giá cuốc sau voucher, đơn vị %.
    'app_fee_percent' => 20,

    // Thưởng giới thiệu.
    'referral_voucher_value'  => 100000, // VND, voucher cấp cho người giới thiệu khách
    'referral_driver_points'  => 50,     // điểm (1 điểm = 1.000đ) cho MỖI bên khi giới thiệu tài xế

    // Tiền tố mã voucher thưởng giới thiệu (REF-<userId>-XXXX). Dashboard dựa vào đây để thống kê.
    'referral_voucher_prefix' => 'REF',

    // Chữ hướng dẫn mở khóa Nhận cuốc ở tab Free. Phí 1 năm do GreenCA chốt, nên đặt qua .env, không nướng vào code.
    'free_unlock_instructions' => env('FREE_UNLOCK_INSTRUCTIONS', 'Liên hệ admin GreenCA để mở khóa Nhận cuốc (phí 1 năm). Ghi rõ số điện thoại đăng nhập khi chuyển khoản.'),
];
