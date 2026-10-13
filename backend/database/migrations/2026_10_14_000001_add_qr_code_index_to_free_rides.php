<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// scopeVisibleTo (FreeRideController::index, NotifyFreeRideAlerts) lọc free_rides theo qr_code
// (whereNotIn chặn/ẩn theo hồ sơ) VÀ expires_at (> now) trên mọi lượt gọi — chưa có index nào phủ
// qr_code trước đó (chỉ có index riêng expires_at và sender_uid). Composite ['qr_code', 'expires_at']
// phủ luôn cả truy vấn chỉ lọc theo qr_code (FreeRideAdminController) nhờ thứ tự cột.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->index(['qr_code', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->dropIndex(['qr_code', 'expires_at']);
        });
    }
};
