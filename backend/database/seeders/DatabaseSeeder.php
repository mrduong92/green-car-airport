<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            UserSeeder::class,
            DriverProfileSeeder::class,
            WalletSeeder::class,
            BookingSeeder::class,
            VoucherSeeder::class,
            PriceConfigSeeder::class,
            StaticPageSeeder::class,
        ]);
    }
}
