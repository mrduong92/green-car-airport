<?php

return [
    'api_key' => env('SEPAY_WEBHOOK_API_KEY'),

    'bank' => [
        'name'           => env('SEPAY_BANK_NAME', 'Vietcombank'),
        'bank_code'      => env('SEPAY_BANK_CODE', 'VCB'),
        'account_number' => env('SEPAY_BANK_ACCOUNT_NUMBER', ''),
        'account_holder' => env('SEPAY_BANK_ACCOUNT_HOLDER', ''),
    ],

    'min_amount_vnd'    => (int) env('SEPAY_MIN_AMOUNT_VND', 10000),
    'suggested_amounts' => [50000, 100000, 200000, 500000],
];
