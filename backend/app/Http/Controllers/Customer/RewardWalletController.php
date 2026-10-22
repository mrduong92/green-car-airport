<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Ví điểm thưởng affiliate của khách (hoàn / hoa hồng / dùng / hoàn lại) — tách khỏi ví thu hộ CTV.
class RewardWalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'reward_points' => (int) Wallet::where('user_id', $request->user()->id)->value('reward_points'),
            'spend_enabled' => AppSetting::pointsSpendEnabled(),
            'max_rate_percent' => AppSetting::pointsMaxRatePercent(),
            'cashback_percent' => AppSetting::cashbackPercent(),
            'commission_percent' => AppSetting::commissionPercent(),
        ]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $walletId = Wallet::where('user_id', $request->user()->id)->value('id');
        if (! $walletId) {
            return response()->json(['data' => [], 'next_page' => null]);
        }

        $page = WalletTransaction::where('wallet_id', $walletId)->where('balance', 'reward')
            ->orderByDesc('id')->paginate(20);

        return response()->json([
            'data' => collect($page->items())->map(fn ($t) => [
                'id' => $t->id, 'type' => $t->type, 'kind' => $t->kind, 'points' => $t->points,
                'description' => $t->description, 'booking_id' => $t->booking_id, 'created_at' => $t->created_at?->toISOString(),
            ])->values(),
            'next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null,
        ]);
    }
}
