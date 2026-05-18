<?php

namespace Database\Seeders;

use App\Models\Voucher;
use Illuminate\Database\Seeder;

class VoucherSeeder extends Seeder
{
    public function run(): void
    {
        $vouchers = [
            [
                'code'        => 'AIRPORT50K',
                'type'        => 'fixed',
                'value'       => 50000,
                'target'      => 'all',
                'expires_at'  => today()->addMonths(3)->format('Y-m-d'),
                'usage_limit' => 100,
                'usage_count' => 12,
                'is_active'   => true,
            ],
            [
                'code'        => 'NEWUSER10',
                'type'        => 'percent',
                'value'       => 10,
                'target'      => 'all',
                'expires_at'  => today()->addMonths(1)->format('Y-m-d'),
                'usage_limit' => 50,
                'usage_count' => 3,
                'is_active'   => true,
            ],
        ];

        foreach ($vouchers as $data) {
            Voucher::create($data);
        }
    }
}
