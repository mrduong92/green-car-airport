<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Tab Free đang tắt (ZALO_FREE_RIDES_ENABLED=false) → 404 như thể không có endpoint.
class EnsureFreeRidesEnabled
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('zalo.free_rides_enabled')) {
            return response()->json(['message' => 'Không tìm thấy.'], 404);
        }

        return $next($request);
    }
}
