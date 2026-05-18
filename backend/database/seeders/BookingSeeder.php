<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Database\Seeder;

class BookingSeeder extends Seeder
{
    public function run(): void
    {
        $customer = User::where('phone', '0901234567')->firstOrFail();
        $driver   = User::where('phone', '0912345678')->firstOrFail();

        $bookings = [
            [
                'customer_id' => $customer->id,
                'driver_id'   => $driver->id,
                'pickup'      => 'Sân bay Tân Sơn Nhất',
                'destination' => 'Quận 1, TP.HCM',
                'date'        => today()->format('Y-m-d'),
                'time'        => '08:00',
                'distance_km' => 7.5,
                'price'       => 200000,
                'discount'    => 0,
                'status'      => 'completed',
                'created_at'  => now()->subDays(1),
            ],
            [
                'customer_id' => $customer->id,
                'driver_id'   => null,
                'pickup'      => 'Sân bay Tân Sơn Nhất',
                'destination' => 'Quận 7, TP.HCM',
                'date'        => today()->addDay()->format('Y-m-d'),
                'time'        => '14:30',
                'distance_km' => 12.3,
                'price'       => 320000,
                'discount'    => 0,
                'status'      => 'finding_driver',
                'created_at'  => now()->subMinutes(10),
            ],
            [
                'customer_id' => $customer->id,
                'driver_id'   => $driver->id,
                'pickup'      => 'Sân bay Tân Sơn Nhất',
                'destination' => 'Bình Thạnh, TP.HCM',
                'date'        => today()->subDay()->format('Y-m-d'),
                'time'        => '10:00',
                'distance_km' => 9.0,
                'price'       => 250000,
                'discount'    => 25000,
                'status'      => 'completed',
                'created_at'  => now()->subDays(3),
            ],
            [
                'customer_id' => $customer->id,
                'driver_id'   => null,
                'pickup'      => 'Sân bay Tân Sơn Nhất',
                'destination' => 'Gò Vấp, TP.HCM',
                'date'        => today()->subDays(5)->format('Y-m-d'),
                'time'        => '06:30',
                'distance_km' => 15.0,
                'price'       => 400000,
                'discount'    => 0,
                'status'      => 'cancelled',
                'cancelled_at'=> now()->subDays(5),
                'created_at'  => now()->subDays(5),
            ],
            [
                'customer_id' => $customer->id,
                'driver_id'   => $driver->id,
                'pickup'      => 'Sân bay Tân Sơn Nhất',
                'destination' => 'Thủ Đức, TP.HCM',
                'date'        => today()->addDays(2)->format('Y-m-d'),
                'time'        => '16:00',
                'distance_km' => 20.0,
                'price'       => 500000,
                'discount'    => 50000,
                'status'      => 'accepted',
                'created_at'  => now()->subHours(2),
            ],
        ];

        foreach ($bookings as $data) {
            $data['updated_at'] = $data['created_at'];
            Booking::create($data);
        }
    }
}
