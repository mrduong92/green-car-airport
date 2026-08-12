<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\DriverTopUpCompletedNotification;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AdminWalletController extends Controller
{
    use AuthorizesRequests;

    public function topup(Request $request, User $user): JsonResponse
    {
        $request->validate([
            'points'      => 'required|integer|min:1',
            'description' => 'nullable|string|max:255',
        ]);

        if ($user->role !== 'driver') {
            return response()->json(['message' => 'Chỉ có thể nạp điểm cho tài xế.'], 422);
        }

        $points = $request->integer('points');
        $desc   = $request->input('description') ?? 'Nạp điểm thủ công bởi Admin';

        DB::transaction(function () use ($user, $points, $desc) {
            $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);

            WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => null,
                'type'        => 'topup',
                'description' => $desc,
                'points'      => $points,
            ]);

            $wallet->increment('points', $points);
        });

        try {
            $user->notify(new DriverTopUpCompletedNotification($points, $points * 1000, 'Admin'));
        } catch (\Throwable $e) {
            Log::warning('Manual top-up notification failed: ' . $e->getMessage());
        }

        $newBalance = Wallet::where('user_id', $user->id)->value('points');

        return response()->json([
            'message' => 'Nạp điểm thành công.',
            'points_added' => $points,
            'new_balance'  => $newBalance,
        ]);
    }

    public function deductPoints(Request $request, User $user): JsonResponse
    {
        $request->validate([
            'points' => 'required|integer|min:1',
            'reason' => 'required|string|max:255',
        ]);

        $this->authorize('deductPoints', $user);

        $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);
        $points = $request->integer('points');

        if ($points > $wallet->points) {
            return response()->json(['message' => 'Số điểm trừ vượt quá số dư hiện có.'], 422);
        }

        DB::transaction(function () use ($wallet, $points, $request) {
            WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => null,
                'type'        => 'debit',
                'description' => 'Admin trừ điểm: ' . $request->input('reason'),
                'points'      => $points,
            ]);
            $wallet->decrement('points', $points);
        });

        return response()->json([
            'message'     => 'Đã trừ điểm.',
            'new_balance' => Wallet::where('user_id', $user->id)->value('points'),
        ]);
    }

    public function resetPoints(Request $request, User $user): JsonResponse
    {
        $request->validate(['reason' => 'required|string|max:255']);

        if (! $user->is_collaborator) {
            return response()->json(['message' => 'Chỉ có thể xóa điểm của Cộng tác viên.'], 422);
        }

        $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);

        if ($wallet->points <= 0) {
            return response()->json(['message' => 'Số dư đã là 0.', 'new_balance' => 0]);
        }

        DB::transaction(function () use ($wallet, $request) {
            WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => null,
                'type'        => 'debit',
                'description' => 'Admin xóa toàn bộ điểm: ' . $request->input('reason'),
                'points'      => $wallet->points,
            ]);
            $wallet->update(['points' => 0]);
        });

        return response()->json(['message' => 'Đã xóa toàn bộ điểm.', 'new_balance' => 0]);
    }
}
