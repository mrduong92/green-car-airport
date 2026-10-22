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
            'free_unlock_fee_vnd' => AppSetting::freeUnlockFeeVnd(),
            'free_show_sender_name' => AppSetting::freeShow(AppSetting::FREE_SHOW_SENDER_NAME),
            'free_show_group_name' => AppSetting::freeShow(AppSetting::FREE_SHOW_GROUP_NAME),
            'free_show_raw_text' => AppSetting::freeShow(AppSetting::FREE_SHOW_RAW_TEXT),
            'affiliate_cashback_percent' => AppSetting::cashbackPercent(),
            'affiliate_commission_percent' => AppSetting::commissionPercent(),
            'points_max_rate_percent' => AppSetting::pointsMaxRatePercent(),
            'points_spend_enabled' => AppSetting::pointsSpendEnabled(),
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
            'free_unlock_fee_vnd' => 'sometimes|required|integer|min:0',
            'free_show_sender_name' => 'sometimes|required|boolean',
            'free_show_group_name' => 'sometimes|required|boolean',
            'free_show_raw_text' => 'sometimes|required|boolean',
            'affiliate_cashback_percent' => 'sometimes|required|numeric|min:0|max:50',
            'affiliate_commission_percent' => 'sometimes|required|numeric|min:0|max:50',
            'points_max_rate_percent' => 'sometimes|required|numeric|min:0|max:50',
            'points_spend_enabled' => 'sometimes|required|boolean',
        ]);

        // driverFeePoints() (Booking) = max(0, phí app − points_used) chỉ đúng khi trần dùng điểm
        // ≤ % phí app — nếu không, khách dùng điểm nhiều hơn phí thì tài xế mất phần chênh lệch
        // (app_fee âm, net_earning sai). Dùng giá trị HIỆU LỰC (gửi lên hoặc đang lưu), không chỉ
        // giá trị trong request, vì admin có thể chỉ sửa một trong hai trường ở mỗi lần gọi.
        $fee = $data['app_fee_percent'] ?? AppSetting::appFeePercent();
        $maxRate = $data['points_max_rate_percent'] ?? AppSetting::pointsMaxRatePercent();
        if ($maxRate > $fee) {
            throw ValidationException::withMessages([
                'points_max_rate_percent' => ['% tối đa trừ bằng điểm không được lớn hơn % phí app (app bù điểm từ phí).'],
            ]);
        }

        AppSetting::set(AppSetting::CONTACT_HOTLINE, $data['contact_hotline']);
        AppSetting::set(AppSetting::CONTACT_EMAIL, $data['contact_email']);
        AppSetting::set(AppSetting::CONTACT_ZALO_PHONE, $data['contact_zalo_phone']);
        foreach ([
            AppSetting::APP_FEE_PERCENT,
            AppSetting::REFERRAL_VOUCHER_VALUE,
            AppSetting::REFERRAL_DRIVER_POINTS,
            AppSetting::FREE_UNLOCK_FEE_VND,
            AppSetting::AFFILIATE_CASHBACK_PERCENT,
            AppSetting::AFFILIATE_COMMISSION_PERCENT,
            AppSetting::POINTS_MAX_RATE_PERCENT,
        ] as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, (string) $data[$key]);
            }
        }

        foreach ([
            AppSetting::FREE_SHOW_SENDER_NAME,
            AppSetting::FREE_SHOW_GROUP_NAME,
            AppSetting::FREE_SHOW_RAW_TEXT,
            AppSetting::POINTS_SPEND_ENABLED,
        ] as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, $data[$key] ? '1' : '0');
            }
        }

        return response()->json($this->index()->getData(true));
    }
}
