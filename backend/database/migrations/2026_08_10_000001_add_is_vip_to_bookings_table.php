<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VIP = xe cá nhân, biển trắng, KHÔNG phải xe dịch vụ.
 *
 * Không phải hạng xe sang, và cố ý KHÔNG nhét vào enum `vehicle_type`:
 * vehicle_type là thang sức chứa (4 < 5 < 7 chỗ), còn xe biển trắng thì có thể
 * là bất kỳ số chỗ nào. Gán cho VIP một bậc trên thang đó thì hoặc tài xế VIP
 * 4 chỗ bị đẩy cuốc 7 chỗ, hoặc tài xế 7 chỗ biển vàng nhận được cuốc VIP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->boolean('is_vip')->default(false)->after('vehicle_type');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (Schema::hasColumn('bookings', 'is_vip')) {
                $table->dropColumn('is_vip');
            }
        });
    }
};
