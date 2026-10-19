<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phí app THỰC giữ lại khi tài xế bỏ cuốc (điểm): charged_fee_points không hoàn + phần đã miễn
 * thu thêm (waived) − phần app bù (shortfall) không thu lại được. refundAcceptCharges() xoá các
 * cột charged/waived/shortfall trên booking, nên số này phải ghi ở log bỏ cuốc — Doanh thu/Dashboard
 * cộng nó vào phí app theo ngày bỏ (cancelled_at). Có dấu: phần bù không thu lại được có thể làm
 * app lỗ (giống keptAppFeeVndSql() của cuốc hoàn thành).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_driver_cancellations', function (Blueprint $table) {
            $table->integer('forfeited_fee_points')->default(0)->after('reason');
            $table->index('cancelled_at');
        });
    }

    public function down(): void
    {
        Schema::table('booking_driver_cancellations', function (Blueprint $table) {
            $table->dropIndex(['cancelled_at']);
            $table->dropColumn('forfeited_fee_points');
        });
    }
};
