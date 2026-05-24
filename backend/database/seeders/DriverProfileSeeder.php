<?php

namespace Database\Seeders;

use App\Models\DriverProfile;
use App\Models\User;
use Illuminate\Database\Seeder;

class DriverProfileSeeder extends Seeder
{
    public function run(): void
    {
        $profiles = [
            [
                'phone'         => '0912345678',
                'vehicle_make'  => 'Toyota',
                'vehicle_model' => 'Camry',
                'vehicle_plate' => '51G-12345',
                'vehicle_year'  => 2022,
                'vehicle_color' => 'Trắng',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => true,
                'rating'        => 4.85,
                'trips_count'   => 142,
                'months_active' => 8,
            ],
            [
                'phone'         => '0934567890',
                'vehicle_make'  => 'Toyota',
                'vehicle_model' => 'Vios',
                'vehicle_plate' => '51F-98765',
                'vehicle_year'  => 2021,
                'vehicle_color' => 'Bạc',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => true,
                'rating'        => 4.90,
                'trips_count'   => 89,
                'months_active' => 5,
            ],
            [
                'phone'         => '0945678901',
                'vehicle_make'  => 'Kia',
                'vehicle_model' => 'Carnival',
                'vehicle_plate' => '51H-11223',
                'vehicle_year'  => 2023,
                'vehicle_color' => 'Đen',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => false,
                'rating'        => 4.75,
                'trips_count'   => 203,
                'months_active' => 11,
            ],
            [
                'phone'         => '0956789012',
                'vehicle_make'  => 'Honda',
                'vehicle_model' => 'CR-V',
                'vehicle_plate' => '51K-33445',
                'vehicle_year'  => 2020,
                'vehicle_color' => 'Đỏ',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => true,
                'rating'        => 4.60,
                'trips_count'   => 47,
                'months_active' => 3,
            ],
            [
                'phone'         => '0967890123',
                'vehicle_make'  => 'Toyota',
                'vehicle_model' => 'Fortuner',
                'vehicle_plate' => '51L-55667',
                'vehicle_year'  => 2023,
                'vehicle_color' => 'Trắng',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => true,
                'rating'        => 5.00,
                'trips_count'   => 315,
                'months_active' => 14,
            ],
            [
                'phone'         => '0978901234',
                'vehicle_make'  => 'Hyundai',
                'vehicle_model' => 'Tucson',
                'vehicle_plate' => '51M-77889',
                'vehicle_year'  => 2022,
                'vehicle_color' => 'Xanh',
                'status'        => 'active',
                'is_verified'   => false,
                'is_online'     => false,
                'rating'        => 4.85,
                'trips_count'   => 12,
                'months_active' => 1,
            ],
            [
                'phone'         => '0989012345',
                'vehicle_make'  => 'Toyota',
                'vehicle_model' => 'Innova',
                'vehicle_plate' => '51N-99001',
                'vehicle_year'  => 2021,
                'vehicle_color' => 'Bạc',
                'status'        => 'pending',
                'is_verified'   => false,
                'is_online'     => false,
                'rating'        => 5.00,
                'trips_count'   => 0,
                'months_active' => 0,
            ],
            [
                'phone'         => '0909123456',
                'vehicle_make'  => 'Mazda',
                'vehicle_model' => 'CX-5',
                'vehicle_plate' => '51P-22334',
                'vehicle_year'  => 2023,
                'vehicle_color' => 'Xám',
                'status'        => 'pending',
                'is_verified'   => false,
                'is_online'     => false,
                'rating'        => 5.00,
                'trips_count'   => 0,
                'months_active' => 0,
            ],
            [
                'phone'         => '0918234567',
                'vehicle_make'  => 'Mitsubishi',
                'vehicle_model' => 'Xpander',
                'vehicle_plate' => '51Q-44556',
                'vehicle_year'  => 2020,
                'vehicle_color' => 'Trắng',
                'status'        => 'blocked',
                'is_verified'   => true,
                'is_online'     => false,
                'rating'        => 3.20,
                'trips_count'   => 8,
                'months_active' => 2,
            ],
            [
                'phone'         => '0927345678',
                'vehicle_make'  => 'Toyota',
                'vehicle_model' => 'Camry',
                'vehicle_plate' => '51R-66778',
                'vehicle_year'  => 2022,
                'vehicle_color' => 'Đen',
                'status'        => 'active',
                'is_verified'   => true,
                'is_online'     => true,
                'rating'        => 4.95,
                'trips_count'   => 178,
                'months_active' => 9,
            ],
        ];

        foreach ($profiles as $data) {
            $driver = User::where('phone', $data['phone'])->firstOrFail();
            DriverProfile::updateOrCreate(
                ['user_id' => $driver->id],
                collect($data)->except('phone')->toArray(),
            );
        }
    }
}
