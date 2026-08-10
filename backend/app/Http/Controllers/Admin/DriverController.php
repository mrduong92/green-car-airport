<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::with(['driverProfile', 'wallet'])->where('role', 'driver');

        if ($request->status) {
            $query->whereHas('driverProfile', fn ($q) => $q->where('status', $request->status));
        }

        if ($request->search) {
            $s = '%' . $request->search . '%';
            $query->where(fn ($q) => $q
                ->where('name', 'like', $s)
                ->orWhere('phone', 'like', $s)
                ->orWhereHas('driverProfile', fn ($q2) => $q2->where('vehicle_plate', 'like', $s))
            );
        }

        $drivers = $query->latest()->get()->map(fn ($u) => $this->formatDriver($u));

        return response()->json($drivers);
    }

    public function block(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'User is not a driver.'], 422);
        }

        $request->validate(['reason' => 'nullable|string|max:255']);

        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            ['status' => 'blocked', 'blocked_reason' => $request->reason],
        );

        return response()->json($this->formatDriver($user->load(['driverProfile', 'wallet'])));
    }

    public function unblock(User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'User is not a driver.'], 422);
        }

        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            ['status' => 'active', 'blocked_reason' => null],
        );

        return response()->json($this->formatDriver($user->load(['driverProfile', 'wallet'])));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'User is not a driver.'], 422);
        }

        $data = $request->validate([
            'name'          => 'sometimes|string|max:100',
            'vehicle_make'  => 'sometimes|string|max:50',
            'vehicle_model' => 'sometimes|string|max:50',
            'vehicle_plate' => 'sometimes|string|max:20',
            'vehicle_year'  => 'sometimes|integer|min:1990|max:2030',
            'vehicle_color' => 'sometimes|string|max:30',
            'is_vip'        => 'sometimes|boolean',
        ]);

        if (isset($data['name'])) {
            $user->update(['name' => $data['name']]);
        }

        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            collect($data)->except('name')->toArray(),
        );

        return response()->json($this->formatDriver($user->load(['driverProfile', 'wallet'])));
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

        app(ReferralService::class)->processDriverReferral(
            $user->fresh(['driverProfile', 'referredBy'])
        );

        return response()->json($this->formatDriver($user->load('driverProfile')));
    }

    private function formatDriver(User $u): array
    {
        $p = $u->driverProfile;

        return [
            'id'             => $u->id,
            'name'           => $u->name,
            'phone'          => $u->phone,
            'vehicle_make'   => $p?->vehicle_make,
            'vehicle_model'  => $p?->vehicle_model,
            'vehicle_plate'  => $p?->vehicle_plate,
            'vehicle_color'  => $p?->vehicle_color,
            'vehicle_type'   => $p?->vehicle_type,
            'is_vip' => (bool) $p?->is_vip,
            'status'         => $p?->status ?? 'pending',
            'blocked_reason' => $p?->blocked_reason,
            'is_verified'    => (bool) ($p?->is_verified),
            'is_online'      => (bool) ($p?->is_online),
            'rating'         => $p ? (float) $p->rating : null,
            'trips_count'    => $p?->trips_count ?? 0,
            'points'                    => $u->wallet?->points ?? 0,
            'cccd_number'               => $p?->cccd_number,
            'gplx_number'               => $p?->gplx_number,
            'vehicle_reg_number'        => $p?->vehicle_reg_number,
            'vehicle_inspection_number' => $p?->vehicle_inspection_number,
            'vehicle_inspection_expiry' => $p?->vehicle_inspection_expiry?->format('Y-m-d'),
            'insurance_number'          => $p?->insurance_number,
            'insurance_expiry'          => $p?->insurance_expiry?->format('Y-m-d'),
        ];
    }
}
