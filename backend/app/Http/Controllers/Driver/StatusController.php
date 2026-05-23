<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatusController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'is_online' => 'required|boolean',
            'latitude'  => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
        ]);

        $profile = $request->user()->driverProfile()
            ->firstOrCreate(['user_id' => $request->user()->id]);

        $profile->update([
            'is_online' => $request->is_online,
            'latitude'  => $request->latitude,
            'longitude' => $request->longitude,
        ]);

        return response()->json(['is_online' => (bool) $profile->is_online]);
    }
}
