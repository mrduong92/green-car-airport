<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Phần phí app (tại tỉ lệ lúc NHẬN) được miễn cho tài xế nhờ điểm khách dùng:
        // appFeePoints − charged_fee_points = min(appFee, points_used). Tài xế tự bỏ cuốc
        // thì refundAcceptCharges() trừ lại đúng phần này để tài xế mất ĐỦ phí app.
        // Không backfill: cuốc đang nhận trước bản này giữ 0 (bỏ cuốc như quy tắc cũ).
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('waived_fee_points')->default(0)->after('held_shortfall_points');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('waived_fee_points');
        });
    }
};
