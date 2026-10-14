<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// F1 của khách: khách đăng ký bằng mã/SĐT của người này. Số liệu chuyến tính theo tháng HOÀN THÀNH
// (updated_at của booking completed) — cùng mốc với hoa hồng được cộng.
class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['nullable', 'date_format:Y-m']]);
        $me = $request->user();

        $f1 = User::where('referred_by_user_id', $me->id)->where('role', 'customer')->orderByDesc('id')
            ->get(['id', 'name', 'phone', 'created_at']);

        $trips = Booking::whereIn('customer_id', $f1->pluck('id'))->where('status', 'completed')
            ->when($data['month'] ?? null, function ($q, $month) {
                $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
                $q->whereBetween('updated_at', [$start, $start->copy()->endOfMonth()]);
            })
            ->selectRaw('customer_id, COUNT(*) AS trips, SUM(price - discount) AS spent, SUM(COALESCE(commission_points, 0)) AS commission')
            ->groupBy('customer_id')->get()->keyBy('customer_id');

        $monthly = collect(range(11, 0))->map(function ($ago) use ($f1) {
            $m = now()->startOfMonth()->subMonths($ago);

            return ['month' => $m->format('Y-m'), 'count' => $f1->filter(fn ($u) => $u->created_at?->format('Y-m') === $m->format('Y-m'))->count()];
        })->values();

        return response()->json([
            'total_f1' => $f1->count(),
            'f1_this_month' => $f1->filter(fn ($u) => $u->created_at?->isSameMonth(now()))->count(),
            'monthly' => $monthly,
            'items' => $f1->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'phone_masked' => self::mask($u->phone),
                'registered_at' => $u->created_at?->toISOString(),
                'trips' => (int) ($trips[$u->id]->trips ?? 0),
                'spent' => (int) ($trips[$u->id]->spent ?? 0),
                'commission_points' => (int) ($trips[$u->id]->commission ?? 0),
            ])->values(),
        ]);
    }

    /** 0912345678 → 0912***678 */
    public static function mask(?string $phone): string
    {
        $p = (string) $phone;

        return strlen($p) >= 8 ? substr($p, 0, 4).'***'.substr($p, -3) : '***';
    }
}
