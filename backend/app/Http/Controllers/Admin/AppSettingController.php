<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
            ...$this->appVersions(),
            'free_unlock_fee_vnd' => AppSetting::freeUnlockFeeVnd(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $versionRules = collect($this->appVersions())
            ->keys()
            ->mapWithKeys(fn ($key) => [$key => ['sometimes', 'required', 'string', 'regex:/^\d+\.\d+\.\d+$/']])
            ->all();

        $data = $request->validate([
            'contact_hotline' => 'required|string|max:50',
            'contact_email' => 'required|email|max:150',
            'contact_zalo_phone' => 'required|string|max:20',
            'app_fee_percent' => 'sometimes|required|numeric|min:0|max:100',
            'referral_voucher_value' => 'sometimes|required|integer|min:1000',
            'referral_driver_points' => 'sometimes|required|integer|min:0',
            ...$versionRules,
            'free_unlock_fee_vnd' => 'sometimes|required|integer|min:0',
        ]);

        // min > latest = mọi bản app bị chặn ở màn cập nhật trong khi store chưa
        // có bản nào đủ mới → khoá toàn bộ người dùng ngoài app.
        foreach (AppSetting::APP_VERSION_PLATFORMS as $platform) {
            foreach (AppSetting::APP_VERSION_APPS as $app) {
                $minKey = AppSetting::appVersionKey($platform, $app, 'min');
                $latestKey = AppSetting::appVersionKey($platform, $app, 'latest');
                $min = $data[$minKey] ?? AppSetting::appVersion($platform, $app, 'min');
                $latest = $data[$latestKey] ?? AppSetting::appVersion($platform, $app, 'latest');
                if (version_compare($min, $latest, '>')) {
                    throw ValidationException::withMessages([
                        $minKey => 'Phiên bản tối thiểu không được lớn hơn phiên bản mới nhất.',
                    ]);
                }
            }
        }

        AppSetting::set(AppSetting::CONTACT_HOTLINE, $data['contact_hotline']);
        AppSetting::set(AppSetting::CONTACT_EMAIL, $data['contact_email']);
        AppSetting::set(AppSetting::CONTACT_ZALO_PHONE, $data['contact_zalo_phone']);
        foreach ([
            AppSetting::APP_FEE_PERCENT,
            AppSetting::REFERRAL_VOUCHER_VALUE,
            AppSetting::REFERRAL_DRIVER_POINTS,
            AppSetting::FREE_UNLOCK_FEE_VND,
        ] as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, (string) $data[$key]);
            }
        }

        foreach (array_keys($versionRules) as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, $data[$key]);
            }
        }

        return response()->json($this->index()->getData(true));
    }

    /** @return array<string, string> vd ['app_version_android_driver_min' => '1.0.0', …] */
    private function appVersions(): array
    {
        $out = [];
        foreach (AppSetting::APP_VERSION_PLATFORMS as $platform) {
            foreach (AppSetting::APP_VERSION_APPS as $app) {
                foreach (['min', 'latest'] as $kind) {
                    $out[AppSetting::appVersionKey($platform, $app, $kind)] = AppSetting::appVersion($platform, $app, $kind);
                }
            }
        }

        return $out;
    }
}
