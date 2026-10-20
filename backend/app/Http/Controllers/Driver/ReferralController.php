<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Customer\ReferralController as CustomerReferralController;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// F1 của tài xế: tài xế khác đăng ký bằng mã/SĐT của người này. Thưởng điểm cho cả hai bên khi F1 hoàn
// thành chuyến đầu và hồ sơ đã duyệt (ReferralService::processDriverReferral).
class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $me = $request->user();

        $f1 = User::where('referred_by_user_id', $me->id)->where('role', 'driver')
            ->with('driverProfile:id,user_id,status,trips_count')
            ->orderByDesc('id')
            ->get(['id', 'name', 'phone', 'created_at', 'deleted_at', 'referral_rewarded_at']);

        $points = AppSetting::referralDriverPoints();

        $items = $f1->map(function ($u) use ($points) {
            $rewarded = $u->referral_rewarded_at !== null;
            $profile = $u->driverProfile;

            // rewarded: đã nhận thưởng · waiting_approval: đã chạy nhưng hồ sơ chưa duyệt · waiting_trip: chưa chạy chuyến đầu
            $status = match (true) {
                $rewarded => 'rewarded',
                ($profile?->trips_count ?? 0) >= 1 && $profile?->status !== 'active' => 'waiting_approval',
                default => 'waiting_trip',
            };

            return [
                'id' => $u->id,
                'name' => $u->name,
                'phone_masked' => $u->isDeleted() ? '—' : CustomerReferralController::mask($u->phone),
                'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($profile?->trips_count ?? 0),
                'status' => $status,
                'reward_points' => $rewarded ? $points : 0,
            ];
        })->values();

        return response()->json([
            'reward_points_per_referral' => $points,
            'total_f1' => $items->count(),
            'rewarded_count' => $items->where('status', 'rewarded')->count(),
            'total_reward_points' => (int) $items->sum('reward_points'),
            'items' => $items,
        ]);
    }
}
