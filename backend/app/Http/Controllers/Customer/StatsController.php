<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\WalletTransaction;
use App\Support\DateBuckets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Thống kê chi tiêu của khách, tính bằng SQL aggregate.
 *
 * Trước đây màn hình Thống kê gọi `GET /api/bookings` để tải TOÀN BỘ chuyến của
 * khách rồi filter/reduce bằng JS trong trình duyệt. Khách đi 300 chuyến là tải
 * 300 bản ghi kèm quan hệ chỉ để hiển thị 4 con số và 1 biểu đồ cột.
 *
 * Nay nhận from/to/group (DateBuckets, dùng chung với báo cáo Giới thiệu của admin) và trả
 * thêm summary + series (chi tiêu, số chuyến, điểm thưởng theo mốc). `period` cũ vẫn chạy khi
 * không có from/to, kèm các key cũ (period/completed/.../points) cho bundle PWA đã cache.
 *
 * ⚠️ Test suite chạy SQLite còn production chạy MySQL. Mọi thứ ở đây phải portable:
 * chỉ dùng aggregate của query builder + COALESCE (chuẩn SQL), KHÔNG dùng
 * DATE_FORMAT hay hàm riêng của MySQL — đó chính là thứ đã gây lỗi 500 ở trang
 * Doanh thu admin mà test không bắt được.
 */
class StatsController extends Controller
{
    // final_price = price - discount - points_used*1000 + surcharge + collection_fee (khớp formatBooking/Booking::finalPrice)
    private const FINAL_PRICE = 'price - discount - points_used * 1000 + surcharge + COALESCE(collection_fee, 0)';

    public function show(Request $request): JsonResponse
    {
        $request->validate([
            'period' => 'nullable|in:week,month,all',
        ]);

        $userId = $request->user()->id;
        $legacy = ! $request->filled('from') && ! $request->filled('to') && $request->filled('period');
        $period = $request->query('period', 'month');

        if ($legacy) {
            $today = Carbon::today(config('app.timezone'));
            [$from, $group] = match ($period) {
                'week' => [$today->copy()->subDays(6), 'day'],
                'all' => [$today->copy()->subMonths(5)->startOfMonth(), 'month'],
                default => [$today->copy()->startOfMonth(), 'day'],
            };
            $range = DateBuckets::make($from, $today, $group);
        } else {
            $range = DateBuckets::fromRequest($request, 'month');
        }

        $fromYmd = $range->from->format('Y-m-d');
        $toYmd = $range->to->format('Y-m-d');

        // Một query gom theo (ngày chuyến, trạng thái) — portable MySQL + SQLite, an toàn
        // ONLY_FULL_GROUP_BY (SELECT chỉ gồm cột gom nhóm + hàm tổng hợp).
        $perDayRows = $this->aggregate($userId, $fromYmd, $toYmd);
        // 'all' kiểu cũ: các con số tổng tính toàn thời gian, chỉ biểu đồ bị chặn cửa sổ 6 tháng.
        $totalRows = $legacy && $period === 'all' ? $this->aggregate($userId, null, null) : $perDayRows;

        $totals = ['completed' => 0, 'cancelled' => 0, 'total_spent' => 0, 'total_saved' => 0];
        foreach ($totalRows as $r) {
            if ($r->status === 'completed') {
                $totals['completed'] += (int) $r->c;
                $totals['total_spent'] += (int) $r->spent;
                // Tiết kiệm = voucher + điểm đã dùng, chỉ chuyến HOÀN THÀNH (cùng phạm vi total_spent);
                // điểm đã HOÀN loại ra, khớp effectivePointsUsed() ở formatBooking.
                $totals['total_saved'] += (int) $r->discount + (int) $r->points * 1000;
            } else {
                $totals['cancelled'] += (int) $r->c;
            }
        }

        $perDay = [];
        foreach ($perDayRows as $r) {
            $d = (string) $r->d;
            if ($r->status === 'completed') {
                $perDay[$d]['completed'] = ($perDay[$d]['completed'] ?? 0) + (int) $r->c;
                $perDay[$d]['spent'] = ($perDay[$d]['spent'] ?? 0) + (int) $r->spent;
            } else {
                $perDay[$d]['cancelled'] = ($perDay[$d]['cancelled'] ?? 0) + (int) $r->c;
            }
        }

        // Điểm thưởng của CHÍNH khách: ví reward, ghi có, kind cashback|commission, theo ngày
        // ghi sổ (created_at, giờ app) — cùng mốc ngày với báo cáo admin.
        $rewardRows = WalletTransaction::query()
            ->join('wallets', 'wallets.id', '=', 'wallet_transactions.wallet_id')
            ->where('wallets.user_id', $userId)
            ->where('wallet_transactions.balance', 'reward')
            ->where('wallet_transactions.type', 'credit')
            ->whereIn('wallet_transactions.kind', ['cashback', 'commission'])
            ->whereBetween('wallet_transactions.created_at', [$range->fromStart(), $range->toEnd()])
            ->groupByRaw('DATE(wallet_transactions.created_at), wallet_transactions.kind')
            ->selectRaw('DATE(wallet_transactions.created_at) AS d, wallet_transactions.kind AS kind, SUM(wallet_transactions.points) AS p')
            ->get();

        $rewardTotal = 0;
        foreach ($rewardRows as $r) {
            $perDay[(string) $r->d][$r->kind === 'cashback' ? 'cashback_points' : 'commission_points'] = (int) $r->p;
            $rewardTotal += (int) $r->p;
        }

        $series = $range->fold($perDay, ['spent', 'completed', 'cancelled', 'cashback_points', 'commission_points']);

        return response()->json([
            'period' => $period,
            'completed' => $totals['completed'],
            'cancelled' => $totals['cancelled'],
            'total_spent' => $totals['total_spent'],
            'total_saved' => $totals['total_saved'],
            'points' => $this->legacyPoints($series, $range),
            'from' => $fromYmd,
            'to' => $toYmd,
            'group' => $range->group,
            'summary' => $totals + ['reward_points' => $rewardTotal],
            'series' => $series,
        ]);
    }

    /** @return Collection<int, object> */
    private function aggregate(int $userId, ?string $from, ?string $to)
    {
        return Booking::where('customer_id', $userId)
            ->whereIn('status', ['completed', 'cancelled'])
            ->when($from, fn ($q) => $q->where('date', '>=', $from))
            ->when($to, fn ($q) => $q->where('date', '<=', $to))
            ->groupBy('date', 'status')
            ->selectRaw('date AS d, status, COUNT(*) AS c, SUM('.self::FINAL_PRICE.') AS spent, SUM(discount) AS discount, '
                .'SUM(CASE WHEN points_refunded_at IS NULL THEN points_used ELSE 0 END) AS points')
            ->get();
    }

    /**
     * Key `points` cũ ({label, value}) cho bundle PWA đã cache: nhãn d/m theo ngày, m/y theo tháng.
     *
     * @return list<array{label: string, value: int}>
     */
    private function legacyPoints(array $series, DateBuckets $range): array
    {
        $buckets = $range->buckets();

        return array_map(fn ($row, $b) => [
            'label' => $range->group === 'month' ? $b['start']->format('m/y') : $b['start']->format('d/m'),
            'value' => (int) $row['spent'],
        ], $series, $buckets);
    }
}
