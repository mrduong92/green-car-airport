<?php

namespace Database\Seeders;

use App\Models\DriverProfile;
use App\Models\User;
use Illuminate\Database\Seeder;

class DriverProfileSeeder extends Seeder
{
    public function run(): void
    {
        $driver = User::where('phone', '0912345678')->firstOrFail();

        DriverProfile::updateOrCreate(
            ['user_id' => $driver->id],
            [
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
        );
    }
}
