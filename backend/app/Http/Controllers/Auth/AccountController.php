<?php

namespace App\Http\Controllers\Auth;

use App\Exceptions\AccountDeletionBlocked;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\DeleteAccountRequest;
use App\Services\AccountDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;

class AccountController extends Controller
{
    /** Khách/tài xế tự xoá tài khoản (yêu cầu Google Play). Admin không tự xoá qua đây. */
    public function destroy(DeleteAccountRequest $request, AccountDeletionService $service): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role, ['customer', 'driver'], true)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        if (! Hash::check($request->input('password'), $user->password)) {
            return response()->json(['message' => 'Mã PIN không đúng.'], 422);
        }

        try {
            $service->delete($user);
        } catch (AccountDeletionBlocked $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Tài khoản của bạn đã được xoá.']);
    }
}
