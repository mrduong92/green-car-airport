<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Feature Flags
    |--------------------------------------------------------------------------
    |
    | Toggle tính năng theo từng môi trường mà không cần code mới.
    | Đặt giá trị trong .env để kiểm soát.
    |
    */

    // Tự động cộng điểm khi nhận webhook chuyển khoản từ Sepay.
    // Tắt khi chưa có tài khoản ngân hàng công ty — admin sẽ nạp thủ công.
    'auto_topup' => env('FEATURE_AUTO_TOPUP', true),

];
