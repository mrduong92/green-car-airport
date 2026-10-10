<?php
namespace App\Http\Controllers;

use App\Models\DeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceTokenController extends Controller
{
    /**
     * Hai dạng payload:
     * - `fcm_token` + `platform` — app native (FCM).
     * - `subscription` — Web Push. GIỮ NGUYÊN: bản web đang chạy ngoài kia vẫn gửi dạng này.
     */
    public function store(Request $request): JsonResponse
    {
        if ($request->has('fcm_token')) {
            $data = $request->validate([
                'fcm_token' => 'required|string|max:255',
                'platform' => 'required|in:android,ios',
            ]);

            // Theo token chứ không theo user: cùng một máy đăng nhập tài khoản
            // khác thì token phải chuyển sang người mới, không bắn nhầm người cũ.
            DeviceToken::updateOrCreate(
                ['fcm_token' => $data['fcm_token']],
                ['user_id' => $request->user()->id, 'platform' => $data['platform'], 'last_used_at' => now()],
            );

            return response()->json(['ok' => true]);
        }

        $request->validate([
            'subscription.endpoint' => 'required|string',
            'subscription.keys.p256dh' => 'required|string',
            'subscription.keys.auth' => 'required|string',
        ]);

        $sub = $request->input('subscription');

        DeviceToken::updateOrCreate(
            ['endpoint' => $sub['endpoint']],
            [
                'user_id'      => $request->user()->id,
                'p256dh'       => $sub['keys']['p256dh'],
                'auth'         => $sub['keys']['auth'],
                'platform'     => $request->input('platform', 'web'),
                'last_used_at' => now(),
            ]
        );

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->validate([
            'fcm_token' => 'required_without:endpoint|string',
            'endpoint' => 'required_without:fcm_token|string',
        ]);

        $query = DeviceToken::where('user_id', $request->user()->id);

        $request->filled('fcm_token')
            ? $query->where('fcm_token', $request->input('fcm_token'))
            : $query->where('endpoint', $request->input('endpoint'));

        $query->delete();

        return response()->json(['ok' => true]);
    }
}
