<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Gỡ tính năng cuốc VIP (xe cá nhân, biển trắng): xe biển trắng chở khách lấy tiền vi phạm quy định vận tải.
// - driver_profiles.is_vip → white_plate: vẫn cần biết xe nào biển trắng để CHẶN nhận cuốc (không phải để ưu tiên).
// - Giá VIP: xoá dòng + cột.
// - bookings.is_vip GIỮ tạm: lệnh `php artisan vip:retire` cần nó để tìm cuốc VIP còn dở; xoá ở bản sau.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->renameColumn('is_vip', 'white_plate');
        });

        DB::table('price_configs')->where('is_vip', true)->delete();
        Schema::table('price_configs', function (Blueprint $table) {
            $table->dropColumn('is_vip');
        });
    }

    public function down(): void
    {
        Schema::table('price_configs', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });

        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->renameColumn('white_plate', 'is_vip');
        });
    }
};
