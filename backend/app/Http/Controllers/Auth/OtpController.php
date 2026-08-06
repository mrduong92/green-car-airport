<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Otp;
use App\Models\User;
use App\Services\Zns\ZnsSender;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OtpController extends Controller
{
    public function __construct(private ZnsSender $zns) {}

    public function send(Request $request): JsonResponse
    {
        $request->validate([
            'phone'   => 'required|string|max:20',
            'purpose' => 'nullable|in:register,driver_register,reset',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        $exists = User::where('phone', $phone)->exists();

        if ($request->purpose === 'register' && $exists) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký.'], 422);
        }

        if ($request->purpose === 'driver_register'
            && User::where('phone', $phone)->where('role', 'driver')->exists()
        ) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký là tài xế.'], 422);
        }

        if ($request->purpose === 'reset' && ! $exists) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Otp::where('phone', $phone)->delete();

        $otp = Otp::create([
            'phone'      => $phone,
            'code'       => $code,
            'expires_at' => now()->addMinutes(5),
        ]);

        if (app()->environment('local') && ! config('services.zns.force_send')) {
            Log::info('[OTP] Local bypass — không gọi ZNS', [
                'phone' => $phone,
                'code'  => $code,
            ]);
            return response()->json(['message' => 'OTP đã được gửi.']);
        }

        Log::info('[OTP] Gửi qua ZNS', [
            'phone'    => $phone,
            'provider' => config('services.zns.provider'),
        ]);

        $result = $this->zns->send($phone, $code);

        Log::info('[OTP] Kết quả ZNS', [
            'phone'         => $phone,
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

        $phone = PhoneNumber::normalize($request->phone);

        $bypass = app()->environment(['local', 'testing']);

        if (! $bypass) {
            $otp = Otp::where('phone', $phone)
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
            ['phone' => $phone],
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
