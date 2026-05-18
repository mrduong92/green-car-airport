<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['phone' => '0901234567', 'role' => 'customer', 'name' => 'Khách Hàng Demo'],
            ['phone' => '0912345678', 'role' => 'driver',   'name' => 'Tài Xế Demo'],
            ['phone' => '0923456789', 'role' => 'admin',    'name' => 'Admin Demo'],
        ];

        foreach ($users as $data) {
            User::updateOrCreate(['phone' => $data['phone']], $data);
        }
    }
}
