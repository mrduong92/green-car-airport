<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\Seeder;

class WalletSeeder extends Seeder
{
    public function run(): void
    {
        $driver = User::where('phone', '0912345678')->firstOrFail();

        $wallet = Wallet::updateOrCreate(
            ['user_id' => $driver->id],
            ['points'  => 1240],
        );

        WalletTransaction::where('wallet_id', $wallet->id)->delete();

        $txns = [
            ['type' => 'credit', 'description' => 'Hoàn thành chuyến #3', 'points' => 160, 'days' => 1],
            ['type' => 'credit', 'description' => 'Hoàn thành chuyến #2', 'points' => 200, 'days' => 3],
            ['type' => 'debit',  'description' => 'Rút điểm tháng 4',     'points' => 500, 'days' => 7],
        ];

        foreach ($txns as $t) {
            WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => null,
                'type'        => $t['type'],
                'description' => $t['description'],
                'points'      => $t['points'],
                'created_at'  => now()->subDays($t['days']),
                'updated_at'  => now()->subDays($t['days']),
            ]);
        }
    }
}
