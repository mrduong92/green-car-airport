<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    public function index(): JsonResponse
    {
        $drivers = User::with('driverProfile')
            ->where('role', 'driver')
            ->latest()
            ->get()
            ->map(fn ($u) => $this->formatDriver($u));

        return response()->json($drivers);
    }

    public function block(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'User is not a driver.'], 422);
        }

        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            ['status'  => 'blocked'],
        );

        return response()->json($this->formatDriver($user->load('driverProfile')));
    }

    public function approve(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'User is not a driver.'], 422);
        }

        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            ['status'  => 'active', 'is_verified' => true],
        );

        return response()->json($this->formatDriver($user->load('driverProfile')));
    }

    private function formatDriver(User $u): array
    {
        $p = $u->driverProfile;

        return [
            'id'            => $u->id,
            'name'          => $u->name,
            'phone'         => $u->phone,
            'vehicle_make'  => $p?->vehicle_make,
            'vehicle_model' => $p?->vehicle_model,
            'vehicle_plate' => $p?->vehicle_plate,
            'vehicle_color' => $p?->vehicle_color,
            'status'        => $p?->status ?? 'pending',
            'is_verified'   => (bool) ($p?->is_verified),
            'is_online'     => (bool) ($p?->is_online),
            'rating'        => $p ? (float) $p->rating : null,
            'trips_count'   => $p?->trips_count ?? 0,
        ];
    }
}
