<?php

namespace App\Console\Commands;

use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Console\Command;

/**
 * Tình trạng service Zalo cho script giám sát (deploy/monitoring/greenca-healthcheck.sh).
 *
 * Quy ước exit code:
 *   0 = ổn
 *   1 = có vấn đề (mất heartbeat, tài khoản mất kết nối, im lặng bất thường trong giờ hoạt động)
 *   2 = chưa service nào từng gửi heartbeat (mới bật tính năng, chưa chạy service)
 */
class ZaloServiceStatus extends Command
{
    protected $signature = 'zalo:service-status';

    protected $description = 'Kiểm tra microservice Zalo (Cuốc Free) còn sống';

    public function handle(ZaloServiceMonitor $monitor): int
    {
        $result = $monitor->status();
        foreach ($result['lines'] as $line) {
            $this->line($line);
        }

        return $result['status'];
    }
}
