<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DevAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        if (! app()->environment('local')) {
            return response()->json(['message' => 'Not available.'], 403);
        }

        $request->validate(['phone' => 'required|string|max:20']);

        $user = User::where('phone', $request->phone)->firstOrFail();

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
