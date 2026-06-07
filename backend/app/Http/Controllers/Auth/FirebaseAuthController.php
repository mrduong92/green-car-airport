<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class FirebaseAuthController extends Controller
{
    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'firebase_token' => 'required|string',
            'password'       => 'nullable|string|size:6',
        ]);

        $claims = app(FirebaseService::class)->verifyIdToken($request->firebase_token);

        if (! $claims) {
            return response()->json(['message' => 'Token không hợp lệ hoặc đã hết hạn.'], 401);
        }

        // +84912345678 → 0912345678
        $phone = '0' . ltrim(str_replace('+84', '', $claims['phone']));

        $user = User::firstOrCreate(
            ['phone' => $phone],
            ['name' => null, 'role' => 'customer'],
        );

        if ($request->filled('password')) {
            $user->update(['password' => Hash::make($request->password)]);
        }

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
