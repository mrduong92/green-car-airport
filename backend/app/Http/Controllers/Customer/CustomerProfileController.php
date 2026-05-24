<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        $stats = Booking::where('customer_id', $user->id)
            ->selectRaw('
                COUNT(*) as total,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = "cancelled" THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN status = "completed" THEN price - IFNULL(discount, 0) ELSE 0 END) as total_spent
            ')
            ->first();

        return response()->json([
            'id'           => $user->id,
            'name'         => $user->name,
            'phone'        => $user->phone,
            'total'        => (int) ($stats->total ?? 0),
            'completed'    => (int) ($stats->completed ?? 0),
            'cancelled'    => (int) ($stats->cancelled ?? 0),
            'total_spent'  => (int) ($stats->total_spent ?? 0),
            'member_since' => $user->created_at?->format('Y'),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|max:100']);
        $request->user()->update($data);

        return response()->json(['message' => 'Đã cập nhật thông tin.']);
    }
}
