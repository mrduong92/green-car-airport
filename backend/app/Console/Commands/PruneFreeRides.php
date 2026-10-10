<?php

namespace App\Console\Commands;

use App\Models\FreeRide;
use Illuminate\Console\Command;

// Cuốc Free chỉ hiển thị cho tài xế khi còn hạn; giữ thêm 8 ngày để thống kê "cuốc/7 ngày"
// ở trang admin đếm đủ cả tuần, rồi xoá.
class PruneFreeRides extends Command
{
    protected $signature = 'zalo:prune-rides';

    protected $description = 'Xoá cuốc Free hết hạn quá 8 ngày';

    public function handle(): int
    {
        $total = 0;
        do {
            $deleted = FreeRide::where('expires_at', '<', now()->subDays(8))->limit(5000)->delete();
            $total += $deleted;
        } while ($deleted > 0);

        $this->info("Đã xoá {$total} cuốc Free hết hạn");

        return self::SUCCESS;
    }
}
