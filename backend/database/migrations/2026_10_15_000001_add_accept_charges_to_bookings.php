<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Số điểm ĐÃ trừ ví tài xế lúc nhận cuốc — mọi khoản hoàn/cộng sau đó dựa vào
        // đây, không tính lại theo tỉ lệ phí / tiền thu hộ hiện tại (có thể đã bị sửa).
        //
        // charged_fee_points = NULL nghĩa là cuốc chưa đi qua luồng trừ-lúc-nhận: chưa
        // ai nhận, hoặc nhận TRƯỚC bản này (hoàn thành vẫn trừ theo cách cũ — xem
        // TripController::settleCompletion).
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('charged_fee_points')->nullable()->after('collection_fee');
            $table->unsignedInteger('held_collection_points')->default(0)->after('charged_fee_points');
            $table->unsignedInteger('held_surcharge_points')->default(0)->after('held_collection_points');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['charged_fee_points', 'held_collection_points', 'held_surcharge_points']);
        });
    }
};
