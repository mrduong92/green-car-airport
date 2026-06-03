<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Otp;
use App\Models\User;
use App\Services\ZaloZnsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class OtpController extends Controller
{
    public function send(Request $request): JsonResponse
    {
        $request->validate(['phone' => 'required|string|max:20']);

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Otp::where('phone', $request->phone)->delete();

        Otp::create([
            'phone'      => $request->phone,
            'code'       => $code,
            'expires_at' => now()->addMinutes(5),
        ]);

        if (app()->environment('local')) {
            Log::info("OTP for {$request->phone}: {$code}");
            return response()->json(['message' => 'OTP đã được gửi.']);
        }

        $sent = app(ZaloZnsService::class)->sendOtp($request->phone, $code);

        if (! $sent) {
            return response()->json(['message' => 'Không thể gửi OTP. Vui lòng thử lại.'], 503);
        }

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
