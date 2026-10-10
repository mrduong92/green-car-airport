<?php

namespace App\Console\Commands;

use App\Models\FreeRideReport;
use App\Models\ZaloAccountRequest;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

// Dọn dữ liệu phụ của Cuốc Free mà không gì tự co lại: yêu cầu thêm/gỡ nick đã kết thúc, báo cáo cuốc,
// yêu cầu lấy lại mã QR đã giao, nhóm nick phụ đã rời. Mốc giữ cấu hình ở config/zalo.php.
// Cuốc Free hết hạn do zalo:prune-rides dọn riêng (giữ 8 ngày cho thống kê admin).
class PruneZaloData extends Command
{
    protected $signature = 'zalo:prune-data';

    protected $description = 'Xoá dữ liệu phụ cũ của Cuốc Free (yêu cầu nick, báo cáo, yêu cầu QR, nhóm đã rời)';

    public function handle(): int
    {
        $accountRequests = $this->chunkedDelete(
            ZaloAccountRequest::query()
                ->whereNotIn('status', ZaloAccountRequest::OPEN_STATUSES)
                ->where('created_at', '<', now()->subDays((int) config('zalo.account_requests_retention_days', 30))),
        );

        $reports = $this->chunkedDelete(
            FreeRideReport::query()
                ->where('created_at', '<', now()->subDays((int) config('zalo.reports_retention_days', 90))),
        );

        $qrRequests = $this->chunkedDelete(
            ZaloQrRefreshRequest::query()
                ->whereNotNull('delivered_at')
                ->where('delivered_at', '<', now()->subDays((int) config('zalo.qr_refresh_requests_retention_days', 90))),
        );

        $groups = $this->chunkedDelete(
            ZaloGroup::query()
                ->whereNotNull('left_at')
                ->where('left_at', '<', now()->subDays((int) config('zalo.left_groups_retention_days', 30))),
        );

        $this->info("Đã xoá {$accountRequests} yêu cầu nick Zalo, {$reports} báo cáo cuốc, {$qrRequests} yêu cầu lấy lại mã QR, {$groups} nhóm đã rời");

        return self::SUCCESS;
    }

    private function chunkedDelete(Builder $query): int
    {
        $total = 0;
        do {
            $deleted = (clone $query)->limit(5000)->delete();
            $total += $deleted;
        } while ($deleted > 0);

        return $total;
    }
}
