<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Hạn mở khóa "Nhận cuốc" ở tab Free (phí 1 năm, admin duyệt tay). NULL hoặc đã qua = đang khóa.
// Không backfill: mọi tài xế hiện có bị khóa cho tới khi admin mở.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->timestamp('free_unlocked_until')->nullable()->after('is_vip');
        });
    }

    public function down(): void
    {
        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropColumn('free_unlocked_until');
        });
    }
};
