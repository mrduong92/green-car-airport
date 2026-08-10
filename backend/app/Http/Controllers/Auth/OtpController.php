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

        if ($request->purpose === 'register'
            && User::where('phone', $phone)->where('role', 'customer')->exists()
        ) {
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

    /**
     * Bước 2 của form đăng ký: kiểm mã OTP rồi ĐÁNH DẤU đã xác thực, nhưng
     * KHÔNG tạo user và KHÔNG cấp token đăng nhập (khác hẳn `verify()`).
     *
     * Vì sao tách riêng: form tài xế có 6 bước, bước 5 bắt tra 7 ô giấy tờ nên
     * thường quá 5 phút. Nếu để tới submit cuối mới kiểm mã thì mã đã hết hạn —
     * đúng bug production 2026-08-10. Từ đây bước cuối chỉ dùng `verified_at`,
     * không đụng tới mã nữa, nên người dùng điền bao lâu cũng được.
     */
    public function verifyForRegistration(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string|max:20',
            'otp'   => 'required|string|size:6',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        if (app()->environment(['local', 'testing'])) {
            // Dev/test: đánh dấu dòng OTP mới nhất nếu có, để luồng phía sau chạy được.
            Otp::where('phone', $phone)->whereNull('used_at')
                ->latest('id')->first()?->update(['verified_at' => now()]);

            return response()->json(['message' => 'Đã xác thực số điện thoại.']);
        }

        $otp = Otp::where('phone', $phone)
            ->where('code', $request->otp)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $otp) {
            return response()->json(['message' => 'Mã OTP không hợp lệ hoặc đã hết hạn.'], 422);
        }

        // Chỉ đánh dấu, KHÔNG set used_at — mã sẽ được "tiêu" ở bước đăng ký cuối.
        $otp->update(['verified_at' => now()]);

        return response()->json(['message' => 'Đã xác thực số điện thoại.']);
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
