<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            // Fixed test accounts
            ['phone' => '0901234567', 'role' => 'customer', 'name' => 'Khách Hàng Demo'],
            ['phone' => '0912345678', 'role' => 'driver',   'name' => 'Tài Xế Demo'],
            ['phone' => '0923456789', 'role' => 'admin',    'name' => 'Admin Demo'],

            // Additional customers
            ['phone' => '0903111222', 'role' => 'customer', 'name' => 'Nguyễn Thị Thu'],
            ['phone' => '0914222333', 'role' => 'customer', 'name' => 'Trần Văn Minh'],
            ['phone' => '0925333444', 'role' => 'customer', 'name' => 'Lê Thị Hương'],
            ['phone' => '0936444555', 'role' => 'customer', 'name' => 'Phạm Quốc Bảo'],
            ['phone' => '0947555666', 'role' => 'customer', 'name' => 'Hoàng Thị Linh'],

            // Additional drivers
            ['phone' => '0934567890', 'role' => 'driver', 'name' => 'Nguyễn Văn Hùng'],
            ['phone' => '0945678901', 'role' => 'driver', 'name' => 'Trần Thị Mai'],
            ['phone' => '0956789012', 'role' => 'driver', 'name' => 'Lê Văn Bình'],
            ['phone' => '0967890123', 'role' => 'driver', 'name' => 'Phạm Văn Đức'],
            ['phone' => '0978901234', 'role' => 'driver', 'name' => 'Hoàng Minh Tuấn'],
            ['phone' => '0989012345', 'role' => 'driver', 'name' => 'Vũ Thị Hoa'],
            ['phone' => '0909123456', 'role' => 'driver', 'name' => 'Đặng Văn Nam'],
            ['phone' => '0918234567', 'role' => 'driver', 'name' => 'Bùi Quang Hải'],
            ['phone' => '0927345678', 'role' => 'driver', 'name' => 'Lý Thị Lan'],
        ];

        foreach ($users as $data) {
            User::updateOrCreate(['phone' => $data['phone']], $data);
        }
    }
}
