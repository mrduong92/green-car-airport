<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\PhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminUserController extends Controller
{
    /** Rule mật khẩu dùng chung với register/resetPassword: đúng 6 chữ số. */
    private const PASSWORD_RULES = ['required', 'string', 'size:6', 'regex:/^\d{6}$/'];

    public function index(Request $request): JsonResponse
    {
        $admins = User::where('role', 'admin')->latest()->get();

        return response()->json($admins->map(fn ($u) => $this->payload($u, $request->user())));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:100',
            'phone'    => 'required|string|max:20',
            'password' => self::PASSWORD_RULES,
        ]);

        $phone = PhoneNumber::normalize($data['phone']);

        // Chỉ chặn trùng trong phạm vi admin — một số điện thoại vẫn được phép
        // vừa là khách hàng/tài xế vừa là admin.
        if (User::where('phone', $phone)->where('role', 'admin')->exists()) {
            return response()->json(['message' => 'Số điện thoại đã là quản trị viên.'], 422);
        }

        $admin = new User([
            'name'  => $data['name'],
            'phone' => $phone,
            'role'  => 'admin',
        ]);
        // User không có cast 'hashed' — phải băm tay, gán chuỗi thô sẽ làm Hash::check() luôn fail.
        $admin->password = Hash::make($data['password']);
        $admin->save();

        return response()->json($this->payload($admin, $request->user()), 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        if ($guard = $this->ensureAdmin($user)) {
            return $guard;
        }

        $data = $request->validate(['name' => 'required|string|max:100']);
        $user->update($data);

        return response()->json($this->payload($user->fresh(), $request->user()));
    }

    public function block(Request $request, User $user): JsonResponse
    {
        if ($guard = $this->ensureAdmin($user) ?? $this->ensureNotSelf($request, $user, 'Không thể tự khoá tài khoản của mình.')) {
            return $guard;
        }

        $user->update(['is_blocked' => true]);
        $user->tokens()->delete();

        return response()->json(['message' => 'Đã khoá quản trị viên.']);
    }

    public function unblock(Request $request, User $user): JsonResponse
    {
        if ($guard = $this->ensureAdmin($user)) {
            return $guard;
        }

        $user->update(['is_blocked' => false]);

        return response()->json(['message' => 'Đã bỏ khoá quản trị viên.']);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        if ($guard = $this->ensureAdmin($user) ?? $this->ensureNotSelf($request, $user, 'Dùng chức năng đổi mật khẩu của tôi.')) {
            return $guard;
        }

        $data = $request->validate(['password' => self::PASSWORD_RULES]);

        $user->password = Hash::make($data['password']);
        $user->save();
        $user->tokens()->delete();

        return response()->json(['message' => 'Đã đặt lại mật khẩu.']);
    }

    public function changeOwnPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'password'         => self::PASSWORD_RULES,
        ]);

        $user = $request->user();

        if (! $user->password || ! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Mật khẩu hiện tại không đúng.'], 422);
        }

        $user->password = Hash::make($data['password']);
        $user->save();

        return response()->json(['message' => 'Đã đổi mật khẩu.']);
    }

    private function payload(User $u, ?User $actor): array
    {
        return [
            'id'         => $u->id,
            'name'       => $u->name,
            'phone'      => $u->phone,
            'is_blocked' => (bool) $u->is_blocked,
            'is_self'    => $u->id === $actor?->id,
            'created_at' => $u->created_at?->format('d/m/Y'),
        ];
    }

    private function ensureAdmin(User $user): ?JsonResponse
    {
        return $user->role === 'admin'
            ? null
            : response()->json(['message' => 'User is not an admin.'], 422);
    }

    private function ensureNotSelf(Request $request, User $user, string $message): ?JsonResponse
    {
        return $user->id === $request->user()->id
            ? response()->json(['message' => $message], 403)
            : null;
    }
}
