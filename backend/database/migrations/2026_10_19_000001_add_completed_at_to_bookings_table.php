<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Mốc hoàn thành THỰC của cuốc — nguồn duy nhất cho "tháng hoàn thành" ở
        // báo cáo affiliate. `updated_at` không dùng được: bất kỳ UPDATE nào sau
        // đó (vd AccountDeletionService xoá note của một F1 đã xoá tài khoản)
        // cũng đẩy updated_at, kéo cuốc cũ sang tháng khác trong báo cáo.
        Schema::table('bookings', function (Blueprint $table) {
            $table->timestamp('completed_at')->nullable()->after('accepted_at');
        });

        // Backfill cuốc đã completed trước khi có cột này: lấy updated_at hiện tại
        // làm mốc hoàn thành (gần đúng nhất có thể cho dữ liệu cũ). Plain query
        // builder — không qua Eloquent nên không bắn model event cho dữ liệu cũ.
        DB::table('bookings')->where('status', 'completed')->update(['completed_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('completed_at');
        });
    }
};
