<?php

return [
    'api_key' => env('SEPAY_WEBHOOK_API_KEY'),

    // KHÔNG đặt mặc định là một ngân hàng cụ thể: thiếu env thì thà hiện trống
    // để lộ ra là cấu hình sai, còn hơn hiện tên một ngân hàng KHÁC với số tài
    // khoản thật — tài xế đọc lướt rất dễ chuyển nhầm.
    'bank' => [
        'name'           => env('SEPAY_BANK_NAME', ''),
        'bank_code'      => env('SEPAY_BANK_CODE', ''),
        'account_number' => env('SEPAY_BANK_ACCOUNT_NUMBER', ''),
        'account_holder' => env('SEPAY_BANK_ACCOUNT_HOLDER', ''),
    ],

    'min_amount_vnd'    => (int) env('SEPAY_MIN_AMOUNT_VND', 10000),
    'suggested_amounts' => [50000, 100000, 200000, 500000],
];
