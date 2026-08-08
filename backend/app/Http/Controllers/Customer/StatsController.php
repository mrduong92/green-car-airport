<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Thống kê chi tiêu của khách, tính bằng SQL aggregate.
 *
 * Trước đây màn hình Thống kê gọi `GET /api/bookings` để tải TOÀN BỘ chuyến của
 * khách rồi filter/reduce bằng JS trong trình duyệt. Khách đi 300 chuyến là tải
 * 300 bản ghi kèm quan hệ chỉ để hiển thị 4 con số và 1 biểu đồ cột.
 *
 * ⚠️ Test suite chạy SQLite còn production chạy MySQL. Mọi thứ ở đây phải portable:
 * chỉ dùng aggregate của query builder + COALESCE (chuẩn SQL), KHÔNG dùng
 * DATE_FORMAT hay hàm riêng của MySQL — đó chính là thứ đã gây lỗi 500 ở trang
 * Doanh thu admin mà test không bắt được.
 */
class StatsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $request->validate([
            'period' => 'nullable|in:week,month,all',
        ]);

        $period = $request->query('period', 'month');
        $userId = $request->user()->id;
        $today = Carbon::today();

        // Cửa sổ cho biểu đồ. Luôn có giới hạn — kể cả 'all' — để số dòng phải
        // gom nhóm bị chặn, không phụ thuộc khách đã đi bao nhiêu chuyến.
        [$chartFrom, $bucket] = match ($period) {
            'week' => [$today->copy()->subDays(6),      'day'],
            'all' => [$today->copy()->subMonths(5)->startOfMonth(), 'month'],
            default => [$today->copy()->startOfMonth(),  'day'],
        };

        // Cửa sổ cho các con số tổng: 'all' = toàn thời gian.
        $totalsFrom = $period === 'all' ? null : $chartFrom;

        $scope = fn () => Booking::where('customer_id', $userId)
            ->when($totalsFrom, fn ($q) => $q->where('date', '>=', $totalsFrom->format('Y-m-d')));

        // final_price = price - discount + surcharge + collection_fee (khớp formatBooking)
        $finalPrice = 'price - discount + surcharge + COALESCE(collection_fee, 0)';

        $completedCount = (clone $scope())->where('status', 'completed')->count();
        $cancelledCount = (clone $scope())->where('status', 'cancelled')->count();
        $totalSpent = (int) (clone $scope())->where('status', 'completed')->sum(DB::raw($finalPrice));
        $totalSaved = (int) (clone $scope())->sum('discount');

        // Gom nhóm theo cột `date` — portable cả MySQL lẫn SQLite. Việc dồn ngày
        // thành tháng cho biểu đồ 'all' làm ở PHP trên tối đa ~180 dòng đã gom.
        $rows = Booking::where('customer_id', $userId)
            ->where('status', 'completed')
            ->where('date', '>=', $chartFrom->format('Y-m-d'))
            ->groupBy('date')
            ->pluck(DB::raw('SUM('.$finalPrice.')'), 'date');

        return response()->json([
            'period' => $period,
            'completed' => $completedCount,
            'cancelled' => $cancelledCount,
            'total_spent' => $totalSpent,
            'total_saved' => $totalSaved,
            'points' => $this->buildPoints($rows, $chartFrom, $today, $bucket),
        ]);
    }

    /**
     * Dựng đủ các mốc của biểu đồ, kể cả mốc không có chuyến nào (value = 0) —
     * biểu đồ cột phải có đủ cột trống thì mới đọc được xu hướng.
     *
     * @return list<array{label: string, value: int}>
     */
    private function buildPoints($rows, Carbon $from, Carbon $today, string $bucket): array
    {
        $sums = [];
        foreach ($rows as $date => $total) {
            $key = $bucket === 'month' ? substr((string) $date, 0, 7) : (string) $date;
            $sums[$key] = ($sums[$key] ?? 0) + (int) $total;
        }

        $points = [];
        $cursor = $from->copy();

        while ($cursor->lessThanOrEqualTo($today)) {
            if ($bucket === 'month') {
                $key = $cursor->format('Y-m');
                $label = $cursor->format('m/y');
                $cursor->addMonth();
            } else {
                $key = $cursor->format('Y-m-d');
                $label = $cursor->format('d/m');
                $cursor->addDay();
            }

            $points[] = ['label' => $label, 'value' => $sums[$key] ?? 0];
        }

        return $points;
    }
}
