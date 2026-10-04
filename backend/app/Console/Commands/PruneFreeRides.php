<?php

namespace App\Console\Commands;

use App\Models\FreeRide;
use Illuminate\Console\Command;

// Cuốc Free chỉ hiển thị khi còn hạn; giữ thêm 1 ngày cho báo cáo/tra cứu rồi xoá.
class PruneFreeRides extends Command
{
    protected $signature = 'zalo:prune-rides';

    protected $description = 'Xoá cuốc Free hết hạn quá 1 ngày';

    public function handle(): int
    {
        $total = 0;
        do {
            $deleted = FreeRide::where('expires_at', '<', now()->subDay())->limit(5000)->delete();
            $total += $deleted;
        } while ($deleted > 0);

        $this->info("Đã xoá {$total} cuốc Free hết hạn");

        return self::SUCCESS;
    }
}
