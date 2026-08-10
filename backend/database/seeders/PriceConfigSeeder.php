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
            // Giá VIP (xe cá nhân, biển trắng). Số dùng cho môi trường dev —
            // admin sửa được ở trang Bảng giá, production nhập tay sau khi deploy.
            ['service_type' => 'airport',    'vehicle_type' => 'sedan_4', 'is_vip' => true, 'price_type' => 'range',  'min_price' => 350000, 'max_price' => 500000, 'sort_order' => 7],
            ['service_type' => 'airport',    'vehicle_type' => 'suv_5',   'is_vip' => true, 'price_type' => 'range',  'min_price' => 350000, 'max_price' => 500000, 'sort_order' => 8],
            ['service_type' => 'airport',    'vehicle_type' => 'mpv_7',   'is_vip' => true, 'price_type' => 'range',  'min_price' => 450000, 'max_price' => 600000, 'sort_order' => 9],
            ['service_type' => 'provincial', 'vehicle_type' => 'sedan_4', 'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 16000,  'max_price' => 16000,  'sort_order' => 10],
            ['service_type' => 'provincial', 'vehicle_type' => 'suv_5',   'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 16000,  'max_price' => 16000,  'sort_order' => 11],
            ['service_type' => 'provincial', 'vehicle_type' => 'mpv_7',   'is_vip' => true, 'price_type' => 'per_km', 'min_price' => 18000,  'max_price' => 18000,  'sort_order' => 12],
        ];

        foreach ($configs as $config) {
            PriceConfig::create(array_merge($config, ['trip_type' => 'one_way']));
        }
    }
}
