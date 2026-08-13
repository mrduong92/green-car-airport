<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;

class SettingsController extends Controller
{
    public function contact(): JsonResponse
    {
        return response()->json([
            'hotline' => AppSetting::get(AppSetting::CONTACT_HOTLINE, '1800 6789'),
            'email' => AppSetting::get(AppSetting::CONTACT_EMAIL, 'support@greenca.vn'),
            'zalo_phone' => AppSetting::get(AppSetting::CONTACT_ZALO_PHONE, '0931919786'),
        ]);
    }
}
