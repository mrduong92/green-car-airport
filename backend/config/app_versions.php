<?php

/**
 * Phiên bản app native. min_supported / latest do admin sửa (AppSetting),
 * đây chỉ là giá trị mặc định khi admin chưa lưu gì.
 *
 * ⚠️ Mặc định PHẢI bằng phiên bản phát hành đầu tiên — cao hơn là khoá toàn
 * bộ người dùng ngoài app.
 */
return [
    'default' => '1.0.0',

    'store_urls' => [
        'android' => [
            'customer' => env('APP_STORE_URL_ANDROID_CUSTOMER', 'https://play.google.com/store/apps/details?id=vn.greenca.customer'),
            'driver' => env('APP_STORE_URL_ANDROID_DRIVER', 'https://play.google.com/store/apps/details?id=vn.greenca.driver'),
        ],
    ],
];
