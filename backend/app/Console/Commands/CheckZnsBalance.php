<?php

namespace App\Console\Commands;

use App\Services\Zns\ZnsSender;
use Illuminate\Console\Command;

/**
 * In số dư ZNS của provider đang dùng, cho script giám sát đọc.
 *
 * Dùng lệnh này thay vì gọi thẳng API bằng bash để logic tra số dư chỉ nằm
 * MỘT chỗ (`AbenlaZnsService::getBalance()`), tránh bash và PHP hiểu khác nhau
 * về mã lỗi — nhất là ca `Code 104` trả kèm `"Balance": 0.0` rất dễ bị đọc
 * nhầm thành "hết tiền".
 *
 * Quy ước exit code cho script giám sát:
 *   0 = tra được và còn trên ngưỡng
 *   1 = tra được nhưng ĐÃ DƯỚI ngưỡng  -> cảnh báo nạp tiền
 *   2 = KHÔNG tra được (provider không hỗ trợ / IP chưa whitelist / mạng lỗi)
 *       -> cảnh báo kiểu khác: "không giám sát được", đừng nhầm với hết tiền
 */
class CheckZnsBalance extends Command
{
    protected $signature = 'zns:balance {--min=0 : Ngưỡng cảnh báo, dưới mức này exit 1}';

    protected $description = 'In số dư ZNS của provider đang dùng';

    public function handle(ZnsSender $zns): int
    {
        $balance = $zns->getBalance();

        if ($balance === null) {
            $this->line('null');

            return 2;
        }

        $this->line((string) $balance);

        return $balance < (int) $this->option('min') ? 1 : 0;
    }
}
