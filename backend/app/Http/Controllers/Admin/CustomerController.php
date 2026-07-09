<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::with('bookingsAsCustomer')->where('role', 'customer');

        if ($request->search) {
            $s = '%' . $request->search . '%';
            $query->where(fn ($q) => $q
                ->where('name', 'like', $s)
                ->orWhere('phone', 'like', $s)
            );
        }

        $customers = $query->latest()->get();

        $walletPoints = Wallet::whereIn('user_id', $customers->where('is_collaborator', true)->pluck('id'))
            ->pluck('points', 'user_id');

        $result = $customers->map(fn ($u) => [
            'id'                 => $u->id,
            'name'               => $u->name,
            'phone'              => $u->phone,
            'is_blocked'         => (bool) $u->is_blocked,
            'is_collaborator'    => (bool) $u->is_collaborator,
            'points'             => $u->is_collaborator ? (int) ($walletPoints[$u->id] ?? 0) : null,
            'total_bookings'     => $u->bookingsAsCustomer->count(),
            'completed_bookings' => $u->bookingsAsCustomer->where('status', 'completed')->count(),
            'total_spent'        => (int) $u->bookingsAsCustomer->where('status', 'completed')->sum('price'),
            'created_at'         => $u->created_at?->format('d/m/Y'),
        ]);

        return response()->json($result);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'customer') {
            return response()->json(['message' => 'User is not a customer.'], 422);
        }

        $data = $request->validate(['name' => 'required|string|max:100']);
        $user->update($data);

        return response()->json([
            'id'    => $user->id,
            'name'  => $user->name,
            'phone' => $user->phone,
        ]);
    }

    public function bookings(User $user): JsonResponse
    {
        if ($user->role !== 'customer') {
            return response()->json(['message' => 'User is not a customer.'], 422);
        }

        $bookings = $user->bookingsAsCustomer()
            ->latest()
            ->get()
            ->map(fn ($b) => [
                'id'          => $b->id,
                'pickup'      => $b->pickup,
                'destination' => $b->destination,
                'date'        => $b->date,
                'time'        => $b->time,
                'price'       => (int) $b->price,
                'status'      => $b->status,
                'created_at'  => $b->created_at?->format('d/m/Y H:i'),
            ]);

        return response()->json($bookings);
    }

    public function block(User $user): JsonResponse
    {
        if ($user->role !== 'customer') {
            return response()->json(['message' => 'User is not a customer.'], 422);
        }

        $user->update(['is_blocked' => true]);
        $user->tokens()->delete();

        return response()->json(['message' => 'Đã chặn khách hàng.']);
    }

    public function unblock(User $user): JsonResponse
    {
        if ($user->role !== 'customer') {
            return response()->json(['message' => 'User is not a customer.'], 422);
        }

        $user->update(['is_blocked' => false]);

        return response()->json(['message' => 'Đã bỏ chặn khách hàng.']);
    }

    public function toggleCollaborator(User $user): JsonResponse
    {
        if ($user->role !== 'customer') {
            return response()->json(['message' => 'User is not a customer.'], 422);
        }

        $user->update(['is_collaborator' => ! $user->is_collaborator]);

        return response()->json(['is_collaborator' => (bool) $user->is_collaborator]);
    }
}
