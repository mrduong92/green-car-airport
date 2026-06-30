<?php
// backend/app/Http/Controllers/Customer/CollaboratorWalletController.php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CollaboratorWalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->is_collaborator) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $wallet = Wallet::where('user_id', $user->id)->first();

        $totalEarned = $wallet
            ? WalletTransaction::where('wallet_id', $wallet->id)
                ->where('type', 'credit')
                ->where('description', 'like', 'Thu hộ cuốc%')
                ->sum('points')
            : 0;

        return response()->json([
            'points'       => $wallet?->points ?? 0,
            'total_earned' => (int) $totalEarned,
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user->is_collaborator) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $wallet = Wallet::where('user_id', $user->id)->first();
        if (! $wallet) {
            return response()->json([]);
        }

        $transactions = WalletTransaction::where('wallet_id', $wallet->id)
            ->where('type', 'credit')
            ->where('description', 'like', 'Thu hộ cuốc%')
            ->latest()
            ->get()
            ->map(fn ($t) => [
                'id'          => $t->id,
                'booking_id'  => $t->booking_id,
                'points'      => $t->points,
                'description' => $t->description,
                'created_at'  => $t->created_at?->toISOString(),
            ]);

        return response()->json($transactions);
    }
}
