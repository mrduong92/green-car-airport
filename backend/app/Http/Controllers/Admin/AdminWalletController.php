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
            'points' => 'required|integer|min:1',
            'description' => 'nullable|string|max:255',
        ]);

        if ($user->role !== 'driver') {
            return response()->json(['message' => 'Chỉ có thể nạp điểm cho tài xế.'], 422);
        }

        $points = $request->integer('points');
        $desc = $request->input('description') ?? 'Nạp điểm thủ công bởi Admin';

        DB::transaction(function () use ($user, $points, $desc, $request) {
            $wallet = Wallet::firstOrCreate(['user_id' => $user->id], ['points' => 0]);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'booking_id' => null,
                'type' => 'topup',
                'description' => $desc,
                'points' => $points,
                'created_by' => $request->user()->id,
            ]);

            $wallet->increment('points', $points);
        });

        try {
            $user->notify(new DriverTopUpCompletedNotification($points, $points * 1000, 'Admin'));
        } catch (\Throwable $e) {
            Log::warning('Manual top-up notification failed: '.$e->getMessage());
        }

        $newBalance = Wallet::where('user_id', $user->id)->value('points');

        return response()->json([
            'message' => 'Nạp điểm thành công.',
            'points_added' => $points,
            'new_balance' => $newBalance,
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
                'wallet_id' => $wallet->id,
                'booking_id' => null,
                'type' => 'debit',
                'description' => 'Admin trừ điểm: '.$request->input('reason'),
                'points' => $points,
                'created_by' => $request->user()->id,
            ]);
            $wallet->decrement('points', $points);
        });

        return response()->json([
            'message' => 'Đã trừ điểm.',
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
                'wallet_id' => $wallet->id,
                'booking_id' => null,
                'type' => 'debit',
                'description' => 'Admin xóa toàn bộ điểm: '.$request->input('reason'),
                'points' => $wallet->points,
                'created_by' => $request->user()->id,
            ]);
            $wallet->update(['points' => 0]);
        });

        return response()->json(['message' => 'Đã xóa toàn bộ điểm.', 'new_balance' => 0]);
    }

    /** Điều kiện "admin điều chỉnh": có created_by, hoặc dữ liệu cũ (trước created_by) nhận diện theo quy ước. */
    private function applyAdminScope($q)
    {
        return $q->where(fn ($q1) => $q1
            ->whereNotNull('created_by')
            ->orWhere(fn ($q2) => $q2->whereNull('booking_id')->where(fn ($q3) => $q3
                ->where('type', 'debit')
                ->orWhere(fn ($q4) => $q4->where('type', 'topup')->where('description', 'not like', 'Nạp điểm qua %'))
            ))
        );
    }

    private function isLegacyManual(WalletTransaction $t): bool
    {
        return $t->booking_id === null
            && ($t->type === 'debit' || ($t->type === 'topup' && ! str_starts_with((string) $t->description, 'Nạp điểm qua ')));
    }

    /** topup | app_fee | collection | refund | admin | other */
    private function categoryOf(WalletTransaction $t): string
    {
        if ($t->created_by !== null || $this->isLegacyManual($t)) {
            return 'admin';
        }

        $desc = (string) $t->description;

        if ($t->booking_id === null) {
            return $t->type === 'topup' ? 'topup' : 'other';
        }

        if ($t->type !== 'debit') {
            return 'refund';
        }

        return match (true) {
            str_starts_with($desc, 'Phí app'), str_starts_with($desc, 'Thu phần phí app') => 'app_fee',
            str_starts_with($desc, 'Thu hộ'), str_starts_with($desc, 'Phí phạt') => 'collection',
            default => 'other',
        };
    }

    /** Lịch sử toàn bộ giao dịch điểm (số dư `points`) của một tài xế; `kind` lọc theo nhóm. */
    public function adjustments(Request $request, User $user): JsonResponse
    {
        if ($user->role !== 'driver') {
            return response()->json(['message' => 'Người dùng không phải tài xế.'], 422);
        }

        $kind = $request->validate([
            'kind' => 'nullable|string|in:all,topup,trip,refund,admin',
        ])['kind'] ?? 'all';

        $wallet = Wallet::where('user_id', $user->id)->first();

        if (! $wallet) {
            return response()->json(['data' => [], 'balance' => 0, 'current_page' => 1, 'last_page' => 1, 'total' => 0]);
        }

        $query = WalletTransaction::with('creator:id,name')
            ->where('wallet_id', $wallet->id)
            ->where('balance', 'points');

        match ($kind) {
            'topup' => $query->where('type', 'topup')->whereNull('created_by')->whereNull('booking_id')
                ->where('description', 'like', 'Nạp điểm qua %'),
            'trip' => $query->where('type', 'debit')->whereNotNull('booking_id')->whereNull('created_by'),
            'refund' => $query->where('type', '!=', 'debit')->whereNotNull('booking_id')->whereNull('created_by'),
            'admin' => $this->applyAdminScope($query),
            default => null,
        };

        $page = $query->latest()->orderByDesc('id')->paginate(20);

        return response()->json([
            'data' => collect($page->items())->map(fn (WalletTransaction $t) => [
                'id' => $t->id,
                'category' => $this->categoryOf($t),
                'direction' => $t->type === 'debit' ? 'out' : 'in',
                'points' => $t->points,
                'description' => $t->description,
                'booking_id' => $t->booking_id,
                'creator_name' => $t->creator?->name,
                'admin_name' => $t->creator?->name,
                'created_at' => $t->created_at,
            ]),
            'balance' => $wallet->points,
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
        ]);
    }
}
