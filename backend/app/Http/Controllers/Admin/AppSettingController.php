<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppSettingController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'contact_hotline' => AppSetting::get(AppSetting::CONTACT_HOTLINE),
            'contact_email' => AppSetting::get(AppSetting::CONTACT_EMAIL),
            'contact_zalo_phone' => AppSetting::get(AppSetting::CONTACT_ZALO_PHONE),
            'app_fee_percent' => AppSetting::appFeePercent(),
            'referral_voucher_value' => AppSetting::referralVoucherValue(),
            'referral_driver_points' => AppSetting::referralDriverPoints(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contact_hotline' => 'required|string|max:50',
            'contact_email' => 'required|email|max:150',
            'contact_zalo_phone' => 'required|string|max:20',
            'app_fee_percent' => 'sometimes|required|numeric|min:0|max:100',
            'referral_voucher_value' => 'sometimes|required|integer|min:1000',
            'referral_driver_points' => 'sometimes|required|integer|min:0',
        ]);

        AppSetting::set(AppSetting::CONTACT_HOTLINE, $data['contact_hotline']);
        AppSetting::set(AppSetting::CONTACT_EMAIL, $data['contact_email']);
        AppSetting::set(AppSetting::CONTACT_ZALO_PHONE, $data['contact_zalo_phone']);
        foreach ([
            AppSetting::APP_FEE_PERCENT,
            AppSetting::REFERRAL_VOUCHER_VALUE,
            AppSetting::REFERRAL_DRIVER_POINTS,
        ] as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, (string) $data[$key]);
            }
        }

        return response()->json($this->index()->getData(true));
    }
}
