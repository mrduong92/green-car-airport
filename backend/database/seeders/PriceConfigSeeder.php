<?php

namespace Database\Seeders;

use App\Models\PriceConfig;
use Illuminate\Database\Seeder;

class PriceConfigSeeder extends Seeder
{
    public function run(): void
    {
        $configs = [
            // Xe sân bay — giá cố định theo chuyến
            ['service_type' => 'airport', 'vehicle_type' => 'sedan_4', 'price_type' => 'range', 'min_price' => 200000, 'max_price' => 300000, 'sort_order' => 1],
            ['service_type' => 'airport', 'vehicle_type' => 'suv_5',   'price_type' => 'range', 'min_price' => 200000, 'max_price' => 300000, 'sort_order' => 2],
            ['service_type' => 'airport', 'vehicle_type' => 'mpv_7',   'price_type' => 'range', 'min_price' => 250000, 'max_price' => 350000, 'sort_order' => 3],
            // Xe đi tỉnh — giá theo km
            ['service_type' => 'provincial', 'vehicle_type' => 'sedan_4', 'price_type' => 'per_km', 'min_price' => 10000, 'max_price' => 10000, 'sort_order' => 4],
            ['service_type' => 'provincial', 'vehicle_type' => 'suv_5',   'price_type' => 'per_km', 'min_price' => 10000, 'max_price' => 10000, 'sort_order' => 5],
            ['service_type' => 'provincial', 'vehicle_type' => 'mpv_7',   'price_type' => 'per_km', 'min_price' => 12000, 'max_price' => 12000, 'sort_order' => 6],
        ];

        foreach ($configs as $config) {
            PriceConfig::create(array_merge($config, ['trip_type' => 'one_way']));
        }
    }
}
