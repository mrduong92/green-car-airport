<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Otp;
use App\Models\User;
use App\Services\CampaignService;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function checkPhone(Request $request): JsonResponse
    {
        $request->validate(['phone' => 'required|string|max:20']);

        $phone = PhoneNumber::normalize($request->phone);

        $roles = User::where('phone', $phone)->pluck('role');

        if ($roles->isEmpty()) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        return response()->json(['exists' => true, 'roles' => $roles->values()]);
    }

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'phone'    => 'required|string|max:20',
            'password' => 'required|string',
            'role'     => 'nullable|string|in:customer,driver,admin',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        $query = User::where('phone', $phone);
        if ($request->role) {
            $query->where('role', $request->role);
        }
        $user = $query->first();

        if (! $user) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        if (in_array($user->role, ['customer', 'admin'], true) && $user->is_blocked) {
            return response()->json(['message' => 'Tài khoản đã bị khoá bởi admin.', 'code' => 'blocked'], 403);
        }

        if ($user->role === 'driver') {
            $user->loadMissing('driverProfile');
            if ($user->driverProfile?->status === 'blocked') {
                $reason = $user->driverProfile->blocked_reason;
                $msg    = $reason
                    ? "Tài khoản bị khoá: {$reason}"
                    : 'Tài khoản đã bị khoá bởi admin.';
                return response()->json(['message' => $msg, 'code' => 'blocked'], 403);
            }
        }

        $bypass = app()->environment(['local', 'testing']);

        if (! $bypass) {
            if (! $user->password) {
                return response()->json([
                    'message' => 'Tài khoản chưa có mật khẩu. Vui lòng đặt lại mật khẩu.',
                    'code'    => 'no_password',
                ], 422);
            }

            if (! Hash::check($request->password, $user->password)) {
                return response()->json(['message' => 'Mật khẩu không đúng.'], 422);
            }
        }

        if ($user->role === 'driver') {
            $user->loadMissing('driverProfile');
        }

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'phone'         => 'required|string|max:20',
            'otp'           => 'required|string|size:6',
            'password'      => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'name'          => 'nullable|string|max:100',
            'referral_code' => 'nullable|string|max:10',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        if (User::where('phone', $phone)->where('role', 'customer')->exists()) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký.'], 422);
        }

        $this->consumeOtp($phone, $request->otp);

        $referredById = null;
        if ($request->referral_code) {
            $referrer = User::where('referral_code', $request->referral_code)->first();
            if ($referrer) {
                $referredById = $referrer->id;
            }
        }

        $user = User::create([
            'phone'               => $phone,
            'name'                => $request->input('name'),
            'password'            => Hash::make($request->password),
            'role'                => 'customer',
            'referred_by_user_id' => $referredById,
        ]);

        $token = $user->createToken('api')->plainTextToken;

        app(CampaignService::class)->runOnCustomerRegistered($user);

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function registerDriver(Request $request): JsonResponse
    {
        $request->validate([
            'phone'                     => 'required|string|max:20',
            'otp'                       => 'required|string|size:6',
            'password'                  => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'name'                      => 'required|string|max:100',
            'vehicle_make'              => 'required|string|max:50',
            'vehicle_model'             => 'required|string|max:50',
            'vehicle_plate'             => 'required|string|max:20',
            'vehicle_year'              => 'required|integer|min:2000|max:' . now()->year,
            'vehicle_color'             => 'required|string|max:30',
            'vehicle_type'              => 'required|in:sedan_4,suv_5,mpv_7',
            'cccd_number'               => 'required|string|max:20',
            'gplx_number'               => 'required|string|max:20',
            'vehicle_reg_number'        => 'required|string|max:30',
            'vehicle_inspection_number' => 'required|string|max:30',
            'vehicle_inspection_expiry' => 'required|date|after:today',
            'insurance_number'          => 'required|string|max:30',
            'insurance_expiry'          => 'required|date|after:today',
            'referral_code'             => 'nullable|string|max:10',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        if (User::where('phone', $phone)->where('role', 'driver')->exists()) {
            return response()->json(['message' => 'Số điện thoại đã được đăng ký là tài xế.'], 422);
        }

        $this->consumeOtp($phone, $request->otp);

        $referredById = null;
        if ($request->referral_code) {
            $referrer = User::where('referral_code', $request->referral_code)
                ->where('phone', '!=', $phone)
                ->first();
            if ($referrer) {
                $referredById = $referrer->id;
            }
        }

        $user = User::create([
            'phone'               => $phone,
            'name'                => $request->name,
            'password'            => Hash::make($request->password),
            'role'                => 'driver',
            'referred_by_user_id' => $referredById,
        ]);

        $user->driverProfile()->create([
            'vehicle_make'              => $request->vehicle_make,
            'vehicle_model'             => $request->vehicle_model,
            'vehicle_plate'             => $request->vehicle_plate,
            'vehicle_year'              => $request->vehicle_year,
            'vehicle_color'             => $request->vehicle_color,
            'vehicle_type'              => $request->vehicle_type,
            'is_online'                 => false,
            'cccd_number'               => $request->cccd_number,
            'gplx_number'               => $request->gplx_number,
            'vehicle_reg_number'        => $request->vehicle_reg_number,
            'vehicle_inspection_number' => $request->vehicle_inspection_number,
            'vehicle_inspection_expiry' => $request->vehicle_inspection_expiry,
            'insurance_number'          => $request->insurance_number,
            'insurance_expiry'          => $request->insurance_expiry,
        ]);

        $user->wallet()->create(['points' => 0]);

        $user->loadMissing('driverProfile');

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ], 201);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'phone'    => 'required|string|max:20',
            'otp'      => 'required|string|size:6',
            'password' => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
            'role'     => 'nullable|string|in:customer,driver,admin',
        ]);

        $phone = PhoneNumber::normalize($request->phone);

        $query = User::where('phone', $phone);
        if ($request->role) {
            $query->where('role', $request->role);
        }
        $user = $query->first();

        if (! $user) {
            return response()->json(['message' => 'Số điện thoại chưa đăng ký.'], 422);
        }

        $this->consumeOtp($phone, $request->otp);

        $user->update(['password' => Hash::make($request->password)]);

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $token,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role === 'driver') {
            $user->loadMissing('driverProfile');
        }
        return response()->json($this->userPayload($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function consumeOtp(string $phone, string $code): void
    {
        if (app()->environment(['local', 'testing'])) return;

        $otp = Otp::where('phone', $phone)
            ->where('code', $code)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $otp) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'otp' => 'Mã OTP không hợp lệ hoặc đã hết hạn.',
            ]);
        }

        $otp->update(['used_at' => now()]);
    }

    private function userPayload(User $user): array
    {
        $payload = [
            'id'            => $user->id,
            'name'          => $user->name,
            'phone'         => $user->phone,
            'role'          => $user->role,
            'referral_code' => $user->referral_code,
        ];

        if ($user->role === 'customer') {
            $payload['is_collaborator'] = (bool) $user->is_collaborator;
            if ($user->pending_penalty > 0) {
                $payload['pending_penalty'] = (int) $user->pending_penalty;
            }
        }

        if ($user->role === 'driver') {
            $payload['needs_onboarding'] = ! $user->driverProfile?->vehicle_plate;
            $payload['approval_status']  = $user->driverProfile?->status ?? 'pending';
        }

        return $payload;
    }
}
