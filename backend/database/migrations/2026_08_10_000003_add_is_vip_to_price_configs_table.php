<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dòng bảng giá này áp cho cuốc VIP.
 *
 * Khoá tra bảng giá đổi từ (service_type, trip_type, vehicle_type) thành
 * (service_type, trip_type, vehicle_type, is_vip). Bảng không có unique index ở
 * tầng DB — việc chống trùng nằm trong PriceConfigController::store().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('price_configs', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('price_configs', function (Blueprint $table) {
            if (Schema::hasColumn('price_configs', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
