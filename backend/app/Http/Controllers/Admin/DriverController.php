<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DriverProfile;
use App\Models\User;
use App\Services\ReferralService;
use App\Services\WhitePlateRetirement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::with(['driverProfile', 'wallet'])->where('role', 'driver')->whereNull('deleted_at');

        if ($request->status) {
            $query->whereHas('driverProfile', fn ($q) => $q->where('status', $request->status));
        }

        // Tài xế xin mở khoá liên hệ tab Free, chưa được mở — admin liên hệ kiểm tra xe rồi duyệt tay.
        if ($request->boolean('free_unlock_requested')) {
            $query->whereHas('driverProfile', fn ($q) => $q->whereNotNull('free_unlock_requested_at')
                ->where(fn ($w) => $w->whereNull('free_unlocked_until')->orWhere('free_unlocked_until', '<=', now())));
        }

        if ($request->search) {
            $s = '%' . $request->search . '%';
            $query->where(fn ($q) => $q
                ->where('name', 'like', $s)
                ->orWhere('phone', 'like', $s)
                ->orWhereHas('driverProfile', fn ($q2) => $q2->where('vehicle_plate', 'like', $s))
            );
        }

        $drivers = $query->latest()->get();
        if ($request->boolean('free_unlock_requested')) {
            // Ai xin trước được duyệt trước.
            $drivers = $drivers->sortBy(fn (User $u) => $u->driverProfile->free_unlock_requested_at)->values();
        }
        $drivers = $drivers->map(fn ($u) => $this->formatDriver($u));

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

    // Admin duyệt tay sau khi tài xế chuyển khoản phí năm. Còn hạn → cộng dồn từ ngày hết hạn; hết hạn/chưa mở → tính từ hôm nay.
    public function grantFreeAccess(User $user): JsonResponse
    {
        $profile = $this->freeAccessProfile($user);
        if ($profile === null) {
            return response()->json(['message' => 'Không phải tài xế hoặc chưa có hồ sơ tài xế.'], 422);
        }

        $base = $profile->hasFreeAccess() ? $profile->free_unlocked_until->copy() : now();
        $profile->update(['free_unlocked_until' => $base->addYear(), 'free_unlock_requested_at' => null]);

        return response()->json($this->formatDriver($user->load(['driverProfile', 'wallet'])));
    }

    public function revokeFreeAccess(User $user): JsonResponse
    {
        $profile = $this->freeAccessProfile($user);
        if ($profile === null) {
            return response()->json(['message' => 'Không phải tài xế hoặc chưa có hồ sơ tài xế.'], 422);
        }

        $profile->update(['free_unlocked_until' => null]);

        return response()->json($this->formatDriver($user->load(['driverProfile', 'wallet'])));
    }

    private function freeAccessProfile(User $user): ?DriverProfile
    {
        return $user->role === 'driver' ? $user->driverProfile : null;
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
            'vehicle_type'  => 'sometimes|in:sedan_4,suv_5,mpv_7',
            // Xe biển trắng (xe cá nhân): bị chặn nhận mọi cuốc. Admin bỏ cờ khi xe đã đổi sang biển vàng.
            'white_plate'   => 'sometimes|boolean',
        ]);

        if (isset($data['name'])) {
            $user->update(['name' => $data['name']]);
        }

        $wasWhitePlate = (bool) $user->driverProfile?->white_plate;
        $user->driverProfile()->updateOrCreate(
            ['user_id' => $user->id],
            collect($data)->except('name')->toArray(),
        );

        // Vừa đánh dấu xe biển trắng: cuốc đã nhận nhưng chưa chạy phải trả về sàn (hoàn phí app).
        if (! $wasWhitePlate && ($data['white_plate'] ?? false)) {
            app(WhitePlateRetirement::class)->releaseDriverTrips($user->id);
        }

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
            'vehicle_year'   => $p?->vehicle_year,
            'vehicle_color'  => $p?->vehicle_color,
            'vehicle_type'   => $p?->vehicle_type,
            'white_plate'    => (bool) $p?->white_plate,
            'status'         => $p?->status ?? 'pending',
            'blocked_reason' => $p?->blocked_reason,
            'is_verified'    => (bool) ($p?->is_verified),
            'is_online'      => (bool) ($p?->is_online),
            'rating'         => $p ? (float) $p->rating : null,
            'trips_count'    => $p?->trips_count ?? 0,
            'points'                    => $u->wallet?->points ?? 0,
            'free_unlocked'       => (bool) $p?->hasFreeAccess(),
            'free_unlocked_until' => $p?->hasFreeAccess() ? $p->free_unlocked_until->getTimestampMs() : null,
            'free_unlock_requested_at' => $p?->free_unlock_requested_at?->getTimestampMs(),
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
