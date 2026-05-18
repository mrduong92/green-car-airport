<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $wallet = $request->user()->wallet()->firstOrCreate(
            ['user_id' => $request->user()->id],
            ['points'  => 0],
        );

        return response()->json([
            'points'         => $wallet->points,
            'equivalent_vnd' => $wallet->points * 1000,
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $wallet = $request->user()->wallet;

        if (! $wallet) {
            return response()->json([]);
        }

        $txns = $wallet->transactions()
            ->latest()
            ->get()
            ->map(fn ($t) => [
                'id'          => $t->id,
                'type'        => $t->type,
                'description' => $t->description,
                'points'      => $t->points,
                'created_at'  => $t->created_at?->toISOString(),
            ]);

        return response()->json($txns);
    }
}
