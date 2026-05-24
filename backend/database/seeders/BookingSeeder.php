<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\Seeder;

class BookingSeeder extends Seeder
{
    public function run(): void
    {
        $customer = User::where('phone', '0901234567')->firstOrFail();
        $driver   = User::where('phone', '0912345678')->firstOrFail();
        $wallet   = Wallet::where('user_id', $driver->id)->firstOrFail();

        // ─── Bookings ────────────────────────────────────────────────────────
        // Columns not listed here default to: driver_id=null, discount=0
        $rows = [

            // ── 7 COMPLETED — lịch sử khách hàng & tài xế ──────────────────
            [
                'pickup'          => 'Sân bay Nội Bài, Hà Nội',
                'pickup_lat'      => 21.2212, 'pickup_lng'      => 105.8072,
                'destination'     => '18 Lê Thái Tổ, Hoàn Kiếm, Hà Nội',
                'destination_lat' => 21.0283, 'destination_lng' => 105.8500,
                'date'  => today()->subDays(60)->format('Y-m-d'), 'time' => '09:00',
                'distance_km' => 30.5, 'price' => 350000, 'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(60),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Crescent Mall, Quận 7, TP.HCM',
                'destination_lat' => 10.7344, 'destination_lng' => 106.7202,
                'date'  => today()->subDays(42)->format('Y-m-d'), 'time' => '14:00',
                'distance_km' => 11.2, 'price' => 420000, 'discount' => 50000,
                'vehicle_type' => 'suv_5',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(42),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Vinhomes Central Park, Bình Thạnh, TP.HCM',
                'destination_lat' => 10.7943, 'destination_lng' => 106.7218,
                'date'  => today()->subDays(30)->format('Y-m-d'), 'time' => '07:30',
                'distance_km' => 8.4, 'price' => 580000, 'vehicle_type' => 'mpv_7',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(30),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Làng Đại học Thủ Đức, TP.HCM',
                'destination_lat' => 10.8568, 'destination_lng' => 106.7542,
                'date'  => today()->subDays(14)->format('Y-m-d'), 'time' => '06:00',
                'distance_km' => 17.3, 'price' => 280000, 'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(14),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Emart Gò Vấp, TP.HCM',
                'destination_lat' => 10.8382, 'destination_lng' => 106.6717,
                'date'  => today()->subDays(7)->format('Y-m-d'), 'time' => '18:00',
                'distance_km' => 6.8, 'price' => 380000, 'discount' => 50000,
                'vehicle_type' => 'suv_5',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(7),
            ],
            [
                'pickup'          => 'Sân bay Nội Bài, Hà Nội',
                'pickup_lat'      => 21.2212, 'pickup_lng'      => 105.8072,
                'destination'     => 'Kim Mã, Ba Đình, Hà Nội',
                'destination_lat' => 21.0376, 'destination_lng' => 105.8370,
                'date'  => today()->subDays(3)->format('Y-m-d'), 'time' => '11:30',
                'distance_km' => 28.9, 'price' => 320000, 'discount' => 30000,
                'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDays(3),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => '268 Lý Thường Kiệt, Quận 10, TP.HCM',
                'destination_lat' => 10.7766, 'destination_lng' => 106.6619,
                'date'  => today()->subDay()->format('Y-m-d'), 'time' => '20:00',
                'distance_km' => 5.1, 'price' => 250000, 'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subDay(),
            ],

            // ── 2 COMPLETED — hôm nay (cho dashboard) ───────────────────────
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Quận 1, TP.HCM',
                'destination_lat' => 10.7769, 'destination_lng' => 106.7009,
                'date'  => today()->format('Y-m-d'), 'time' => '07:00',
                'distance_km' => 7.2, 'price' => 260000, 'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subHours(3),
            ],
            [
                'pickup'          => 'Sân bay Nội Bài, Hà Nội',
                'pickup_lat'      => 21.2212, 'pickup_lng'      => 105.8072,
                'destination'     => 'Hoàn Kiếm, Hà Nội',
                'destination_lat' => 21.0283, 'destination_lng' => 105.8500,
                'date'  => today()->format('Y-m-d'), 'time' => '08:30',
                'distance_km' => 29.5, 'price' => 340000, 'vehicle_type' => 'sedan_4',
                'status' => 'completed', 'driver_id' => $driver->id,
                'created_at' => now()->subHours(1),
            ],

            // ── 2 CANCELLED ──────────────────────────────────────────────────
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Nhà Bè, TP.HCM',
                'destination_lat' => 10.6868, 'destination_lng' => 106.7300,
                'date'  => today()->subDays(10)->format('Y-m-d'), 'time' => '08:00',
                'distance_km' => 20.0, 'price' => 300000, 'vehicle_type' => 'sedan_4',
                'status' => 'cancelled',
                'created_at' => now()->subDays(10),
            ],
            [
                'pickup'          => 'Sân bay Nội Bài, Hà Nội',
                'pickup_lat'      => 21.2212, 'pickup_lng'      => 105.8072,
                'destination'     => 'Cầu Giấy, Hà Nội',
                'destination_lat' => 21.0403, 'destination_lng' => 105.7934,
                'date'  => today()->subDays(4)->format('Y-m-d'), 'time' => '16:30',
                'distance_km' => 26.0, 'price' => 360000, 'vehicle_type' => 'sedan_4',
                'status' => 'cancelled',
                'created_at' => now()->subDays(4),
            ],

            // ── 3 FINDING_DRIVER — hiện trong danh sách tài xế ──────────────
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => '99 Nguyễn Đình Chiểu, Quận 3, TP.HCM',
                'destination_lat' => 10.7858, 'destination_lng' => 106.6830,
                'date'  => today()->format('Y-m-d'), 'time' => '15:00',
                'distance_km' => 6.5, 'price' => 220000, 'vehicle_type' => 'sedan_4',
                'status' => 'finding_driver',
                'created_at' => now()->subMinutes(15),
            ],
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Lotte Mart Quận 11, TP.HCM',
                'destination_lat' => 10.7617, 'destination_lng' => 106.6474,
                'date'  => today()->format('Y-m-d'), 'time' => '16:00',
                'distance_km' => 9.2, 'price' => 350000, 'vehicle_type' => 'suv_5',
                'status' => 'finding_driver',
                'created_at' => now()->subMinutes(8),
            ],
            [
                'pickup'          => 'Sân bay Nội Bài, Hà Nội',
                'pickup_lat'      => 21.2212, 'pickup_lng'      => 105.8072,
                'destination'     => 'Aeon Mall Long Biên, Hà Nội',
                'destination_lat' => 21.0373, 'destination_lng' => 105.8864,
                'date'  => today()->format('Y-m-d'), 'time' => '17:30',
                'distance_km' => 27.4, 'price' => 290000, 'vehicle_type' => 'sedan_4',
                'status' => 'finding_driver',
                'created_at' => now()->subMinutes(3),
            ],

            // ── 1 ACCEPTED — tài xế đang thực hiện, có thể tiến hành ────────
            [
                'pickup'          => 'Sân bay Tân Sơn Nhất, TP.HCM',
                'pickup_lat'      => 10.8180, 'pickup_lng'      => 106.6520,
                'destination'     => 'Vincom Mega Mall, Quận 9, TP.HCM',
                'destination_lat' => 10.8468, 'destination_lng' => 106.7791,
                'date'  => today()->format('Y-m-d'), 'time' => '14:30',
                'distance_km' => 22.0, 'price' => 450000, 'vehicle_type' => 'suv_5',
                'status' => 'accepted', 'driver_id' => $driver->id,
                'created_at' => now()->subHours(2),
            ],
        ];

        // ─── Insert bookings ─────────────────────────────────────────────────
        $completedBookings = [];

        foreach ($rows as $row) {
            $createdAt = $row['created_at'];

            $booking = Booking::create([
                'customer_id'     => $customer->id,
                'driver_id'       => $row['driver_id'] ?? null,
                'pickup'          => $row['pickup'],
                'pickup_lat'      => $row['pickup_lat'] ?? null,
                'pickup_lng'      => $row['pickup_lng'] ?? null,
                'destination'     => $row['destination'],
                'destination_lat' => $row['destination_lat'] ?? null,
                'destination_lng' => $row['destination_lng'] ?? null,
                'date'            => $row['date'],
                'time'            => $row['time'],
                'distance_km'     => $row['distance_km'],
                'price'           => $row['price'],
                'discount'        => $row['discount'] ?? 0,
                'vehicle_type'    => $row['vehicle_type'],
                'status'          => $row['status'],
                'cancelled_at'    => $row['status'] === 'cancelled' ? $createdAt->copy()->addMinutes(5) : null,
                'created_at'      => $createdAt,
                'updated_at'      => $createdAt,
            ]);

            if ($row['status'] === 'completed') {
                $completedBookings[] = ['booking' => $booking, 'ts' => $createdAt];
            }
        }

        // ─── Wallet transactions for completed trips ─────────────────────────
        $totalPoints = 0;

        foreach ($completedBookings as ['booking' => $b, 'ts' => $ts]) {
            $pts = (int) round($b->price * 0.80 / 1000);
            $totalPoints += $pts;

            WalletTransaction::create([
                'wallet_id'   => $wallet->id,
                'booking_id'  => $b->id,
                'type'        => 'credit',
                'description' => "Hoàn thành chuyến #{$b->id}",
                'points'      => $pts,
                'created_at'  => $ts,
                'updated_at'  => $ts,
            ]);
        }

        // Một lần rút điểm thủ công
        $debit = 500;
        WalletTransaction::create([
            'wallet_id'   => $wallet->id,
            'booking_id'  => null,
            'type'        => 'debit',
            'description' => 'Rút điểm tháng 4/2026',
            'points'      => $debit,
            'created_at'  => now()->subDays(20),
            'updated_at'  => now()->subDays(20),
        ]);

        $wallet->update(['points' => max(0, $totalPoints - $debit)]);

        // ─── Bookings for extra customers ────────────────────────────────────
        $extraCustomers = [
            ['phone' => '0903111222', 'bookings' => [
                ['pickup' => 'Sân bay Nội Bài, Hà Nội', 'destination' => 'Hoàn Kiếm, Hà Nội',           'distance_km' => 30.5, 'price' => 350000, 'days_ago' => 45],
                ['pickup' => 'Sân bay Nội Bài, Hà Nội', 'destination' => 'Cầu Giấy, Hà Nội',             'distance_km' => 28.0, 'price' => 320000, 'days_ago' => 12],
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Quận 1, TP.HCM',         'distance_km' => 7.5,  'price' => 280000, 'days_ago' => 2],
            ]],
            ['phone' => '0914222333', 'bookings' => [
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Bình Dương',              'distance_km' => 35.0, 'price' => 520000, 'days_ago' => 90],
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Đồng Nai',                'distance_km' => 45.0, 'price' => 650000, 'days_ago' => 30],
            ]],
            ['phone' => '0925333444', 'bookings' => [
                ['pickup' => 'Sân bay Nội Bài, Hà Nội', 'destination' => 'Long Biên, Hà Nội',            'distance_km' => 25.0, 'price' => 290000, 'days_ago' => 20],
                ['pickup' => 'Sân bay Nội Bài, Hà Nội', 'destination' => 'Đông Anh, Hà Nội',             'distance_km' => 15.0, 'price' => 200000, 'days_ago' => 5],
                ['pickup' => 'Sân bay Nội Bài, Hà Nội', 'destination' => 'Nam Từ Liêm, Hà Nội',          'distance_km' => 22.0, 'price' => 260000, 'days_ago' => 1],
            ]],
            ['phone' => '0936444555', 'bookings' => [
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Thủ Đức, TP.HCM',        'distance_km' => 18.0, 'price' => 310000, 'days_ago' => 60],
            ]],
            ['phone' => '0947555666', 'bookings' => [
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Quận 7, TP.HCM',         'distance_km' => 12.0, 'price' => 340000, 'days_ago' => 15],
                ['pickup' => 'Sân bay Tân Sơn Nhất, TP.HCM', 'destination' => 'Quận 4, TP.HCM',         'distance_km' => 9.0,  'price' => 260000, 'days_ago' => 3],
            ]],
        ];

        foreach ($extraCustomers as ['phone' => $phone, 'bookings' => $trips]) {
            $c = User::where('phone', $phone)->first();
            if (! $c) continue;

            foreach ($trips as $t) {
                $ts = now()->subDays($t['days_ago']);
                Booking::create([
                    'customer_id'  => $c->id,
                    'driver_id'    => $driver->id,
                    'pickup'       => $t['pickup'],
                    'destination'  => $t['destination'],
                    'date'         => $ts->format('Y-m-d'),
                    'time'         => '10:00',
                    'distance_km'  => $t['distance_km'],
                    'price'        => $t['price'],
                    'discount'     => 0,
                    'vehicle_type' => 'sedan_4',
                    'status'       => 'completed',
                    'created_at'   => $ts,
                    'updated_at'   => $ts,
                ]);
            }
        }
    }
}

