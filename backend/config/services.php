<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'vapid' => [
        'subject'     => env('VAPID_SUBJECT', 'mailto:admin@greenca.vn'),
        'public_key'  => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
    ],

    'zalo_zns' => [
        'app_id'        => env('ZALO_APP_ID'),
        'app_secret'    => env('ZALO_APP_SECRET'),
        'refresh_token' => env('ZALO_REFRESH_TOKEN'),
        'template_id'   => env('ZALO_OTP_TEMPLATE_ID'),
    ],

    'zns' => [
        'provider'   => env('ZNS_PROVIDER', 'southtelecom'),
        'force_send' => env('ZNS_FORCE_SEND', false),
    ],

    'southtelecom_zns' => [
        'base_url'    => env('SOUTHTELECOM_ZNS_BASE_URL', 'https://api-04.worldsms.vn/apidebit'),
        'user'        => env('SOUTHTELECOM_ZNS_USER'),
        'password'    => env('SOUTHTELECOM_ZNS_PASSWORD'),
        'from'        => env('SOUTHTELECOM_ZNS_FROM'),
        'template_id' => env('SOUTHTELECOM_ZNS_TEMPLATE_ID'),
        'dlr_token'   => env('SOUTHTELECOM_ZNS_DLR_TOKEN'),
    ],

    'abenla_zns' => [
        'base_url'        => env('ABENLA_BASE_URL', 'https://api.abenla.com/api'),
        'login_name'      => env('ABENLA_LOGIN_NAME'),
        'sign'            => env('ABENLA_SIGN'),
        'service_type_id' => env('ABENLA_SERVICE_TYPE_ID'),
        'brand_name'      => env('ABENLA_BRAND_NAME'),
    ],

];
