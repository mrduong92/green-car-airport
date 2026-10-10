<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Số điểm (thu hộ + phí phạt huỷ) đã trừ ví tài xế lúc NHẬN cuốc, để hoàn lại
        // đúng số đó nếu cuốc bị huỷ. 0 với cuốc nhận trước bản này → hoàn thành vẫn
        // trừ theo cách cũ (xem TripController::settleCompletion).
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('held_points')->default(0)->after('collection_fee');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('held_points');
        });
    }
};
