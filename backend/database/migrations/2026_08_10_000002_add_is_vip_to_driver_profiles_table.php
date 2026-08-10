<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Xe của tài xế là xe cá nhân, biển trắng.
 *
 * Hệ thống chỉ lưu chuỗi biển số nên không tự phân biệt được biển trắng/vàng —
 * giá trị này do tài xế tự khai lúc đăng ký và admin xác nhận khi duyệt hồ sơ.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            if (Schema::hasColumn('driver_profiles', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
