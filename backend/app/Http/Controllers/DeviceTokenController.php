<?php
namespace App\Http\Controllers;

use App\Models\DeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
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
        $request->validate(['endpoint' => 'required|string']);

        DeviceToken::where('user_id', $request->user()->id)
            ->where('endpoint', $request->input('endpoint'))
            ->delete();

        return response()->json(['ok' => true]);
    }
}
