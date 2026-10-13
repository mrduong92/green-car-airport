<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Xác thực request từ service Zalo (không dùng Sanctum — service không phải người dùng).
 *
 * Chữ ký = hex HMAC-SHA256(ZALO_BOT_SECRET, "{X-Zalo-Timestamp}.{raw body}").
 * Ký trên body THÔ (getContent) chứ không phải mảng đã parse, để PHP và Node
 * không lệch nhau vì cách encode JSON (unicode, thứ tự khoá...).
 */
class VerifyZaloBotSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('zalo.enabled')) {
            return response()->json(['message' => 'Đã tắt kết nối service Zalo'], 503);
        }

        $secret = (string) config('zalo.bot_secret', '');
        $timestamp = (string) $request->header('X-Zalo-Timestamp', '');
        $signature = (string) $request->header('X-Zalo-Signature', '');

        if ($secret === '' || $signature === '' || ! ctype_digit($timestamp)) {
            return response()->json(['message' => 'Sai chữ ký'], 401);
        }

        if (abs(now()->timestamp - (int) $timestamp) > (int) config('zalo.max_clock_skew_seconds')) {
            return response()->json(['message' => 'Lệch giờ quá lớn — kiểm tra NTP trên VPS service'], 401);
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$request->getContent(), $secret);
        if (! hash_equals($expected, $signature)) {
            return response()->json(['message' => 'Sai chữ ký'], 401);
        }

        return $next($request);
    }
}
