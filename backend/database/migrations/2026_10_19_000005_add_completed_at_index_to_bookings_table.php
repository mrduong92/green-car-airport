<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Doanh thu/Dashboard/báo cáo affiliate lọc + gom theo bookings.completed_at (không còn
 * COALESCE với created_at) → cần index. Lưới an toàn: cuốc completed nào còn NULL (2026_10_19_000001
 * đã backfill từ updated_at) thì lấy updated_at, không có thì created_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('bookings')->where('status', 'completed')->whereNull('completed_at')
            ->update(['completed_at' => DB::raw('COALESCE(updated_at, created_at)')]);

        Schema::table('bookings', function (Blueprint $table) {
            $table->index('completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropIndex(['completed_at']);
        });
    }
};
