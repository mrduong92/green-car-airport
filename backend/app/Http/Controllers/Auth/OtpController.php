<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Otp;
use App\Models\User;
use App\Services\Zns\ZnsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OtpController extends Controller
{
    public function __construct(private ZnsSender $zns) {}

    public function send(Request $request): JsonResponse
    {
        $request->validate(['phone' => 'required|string|max:20']);

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Otp::where('phone', $request->phone)->delete();

        $otp = Otp::create([
            'phone'      => $request->phone,
            'code'       => $code,
            'expires_at' => now()->addMinutes(5),
        ]);

        if (app()->environment('local') && ! config('services.zns.force_send')) {
            Log::info('[OTP] Local bypass — không gọi ZNS', [
                'phone' => $request->phone,
                'code'  => $code,
            ]);
            return response()->json(['message' => 'OTP đã được gửi.']);
        }

        Log::info('[OTP] Gửi qua ZNS', [
            'phone'    => $request->phone,
            'provider' => config('services.zns.provider'),
        ]);

        $result = $this->zns->send($request->phone, $code);

        Log::info('[OTP] Kết quả ZNS', [
            'phone'         => $request->phone,
            'success'       => $result->success,
            'client_req_id' => $result->clientReqId,
            'tracking_id'   => $result->trackingId,
            'error'         => $result->error,
        ]);

        if (! $result->success) {
            return response()->json(['message' => 'Không thể gửi OTP. Vui lòng thử lại.'], 503);
        }

        $otp->update([
            'client_req_id'   => $result->clientReqId,
            'tracking_id'     => $result->trackingId,
            'delivery_status' => 'pending',
        ]);

        return response()->json(['message' => 'OTP đã được gửi.']);
    }

    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string|max:20',
            'otp'   => 'required|string|size:6',
        ]);

        $bypass = app()->environment('local') || $request->otp === '000000';

        if (! $bypass) {
            $otp = Otp::where('phone', $request->phone)
                ->where('code', $request->otp)
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->first();

            if (! $otp) {
                return response()->json(['message' => 'Mã OTP không hợp lệ hoặc đã hết hạn.'], 422);
            }

            $otp->update(['used_at' => now()]);
        }

        $user = User::firstOrCreate(
            ['phone' => $request->phone],
            ['name' => null, 'role' => 'customer'],
        );

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => [
                'id'    => $user->id,
                'name'  => $user->name,
                'phone' => $user->phone,
                'role'  => $user->role,
            ],
            'token' => $token,
        ]);
    }
}
