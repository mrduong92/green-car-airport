<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function update(Request $request, \App\Models\User $user): JsonResponse
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

        $customers = $query->latest()->get()->map(fn ($u) => [
            'id'                 => $u->id,
            'name'               => $u->name,
            'phone'              => $u->phone,
            'total_bookings'     => $u->bookingsAsCustomer->count(),
            'completed_bookings' => $u->bookingsAsCustomer->where('status', 'completed')->count(),
            'total_spent'        => (int) $u->bookingsAsCustomer->where('status', 'completed')->sum('price'),
            'created_at'         => $u->created_at?->format('d/m/Y'),
        ]);

        return response()->json($customers);
    }
}
