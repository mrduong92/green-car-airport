<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Chỉ tài xế đã duyệt (driver_profiles.status = active). Đặt sau 'role:driver'.
class EnsureDriverActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user?->role !== 'driver' || $user->driverProfile?->status !== 'active') {
            return response()->json(['message' => 'Tài khoản tài xế chưa được duyệt.'], 403);
        }

        return $next($request);
    }
}
