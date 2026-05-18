<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->driverProfile;

        return response()->json($this->formatProfile($user, $profile));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'sometimes|string|max:100',
            'vehicle_make'  => 'sometimes|string|max:50',
            'vehicle_model' => 'sometimes|string|max:50',
            'vehicle_plate' => 'sometimes|string|max:20',
            'vehicle_year'  => 'sometimes|integer|min:1990|max:2030',
            'vehicle_color' => 'sometimes|string|max:30',
        ]);

        $user = $request->user();

        if (isset($data['name'])) {
            $user->update(['name' => $data['name']]);
            unset($data['name']);
        }

        $profile = $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            $data,
        );

        return response()->json($this->formatProfile($user->fresh(), $profile->fresh()));
    }

    private function formatProfile($user, $profile): array
    {
        return [
            'id'             => $user->id,
            'name'           => $user->name,
            'phone'          => $user->phone,
            'vehicle_make'   => $profile?->vehicle_make,
            'vehicle_model'  => $profile?->vehicle_model,
            'vehicle_plate'  => $profile?->vehicle_plate,
            'vehicle_year'   => $profile?->vehicle_year,
            'vehicle_color'  => $profile?->vehicle_color,
            'status'         => $profile?->status,
            'is_verified'    => (bool) ($profile?->is_verified),
            'is_online'      => (bool) ($profile?->is_online),
            'rating'         => $profile ? (float) $profile->rating : null,
            'trips_count'    => $profile?->trips_count ?? 0,
            'months_active'  => $profile?->months_active ?? 0,
        ];
    }
}
