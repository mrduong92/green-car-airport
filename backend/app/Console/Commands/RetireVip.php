<?php

namespace App\Console\Commands;

use App\Models\DriverProfile;
use App\Services\WhitePlateRetirement;
use Illuminate\Console\Command;

// Chạy MỘT lần khi phát hành bản gỡ cuốc VIP (chạy lại không sao). Xem App\Services\WhitePlateRetirement.
class RetireVip extends Command
{
    protected $signature = 'vip:retire';

    protected $description = 'Gỡ cuốc VIP: cuốc VIP đang chờ thành cuốc thường; cuốc chưa chạy của xe biển trắng trả về sàn, hoàn phí app';

    public function handle(WhitePlateRetirement $retirement): int
    {
        $converted = $retirement->convertWaitingVipBookings();

        $released = 0;
        foreach (DriverProfile::where('white_plate', true)->pluck('user_id') as $driverId) {
            $released += $retirement->releaseDriverTrips($driverId);
        }

        $this->info("Đổi {$converted} cuốc VIP đang chờ sang xe thường; trả {$released} cuốc của xe biển trắng về sàn.");

        return self::SUCCESS;
    }
}
