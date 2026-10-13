<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bộ lọc tài xế lưu lại để nhận thông báo đẩy khi có cuốc Free mới khớp — mỗi tài xế 1 dòng.
        Schema::create('driver_free_ride_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('enabled')->default(false);
            $table->string('direction', 16)->nullable();
            $table->unsignedTinyInteger('seats')->nullable();
            $table->string('keywords', 100)->nullable();
            $table->timestamp('last_pushed_at')->nullable();
            $table->timestamps();
        });

        // NotifyFreeRideAlerts lọc theo zalo_group_id (điều kiện hiển thị dùng chung với tab Free) —
        // chưa có index nên mỗi lần chạy sẽ quét cả bảng free_rides.
        Schema::table('free_rides', function (Blueprint $table) {
            $table->index('zalo_group_id');
        });
    }

    public function down(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->dropIndex(['zalo_group_id']);
        });

        Schema::dropIfExists('driver_free_ride_alerts');
    }
};
