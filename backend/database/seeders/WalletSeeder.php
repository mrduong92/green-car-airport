<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Wallet;
use Illuminate\Database\Seeder;

class WalletSeeder extends Seeder
{
    public function run(): void
    {
        $driver = User::where('phone', '0912345678')->firstOrFail();

        // Tạo ví cho tài xế — BookingSeeder sẽ cộng điểm từ các chuyến hoàn thành
        Wallet::updateOrCreate(
            ['user_id' => $driver->id],
            ['points'  => 0],
        );
    }
}
