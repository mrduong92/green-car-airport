<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Mốc "đã xét tới cuốc id nào" của từng cảnh báo — thay cho mốc created_at (độ phân giải giây,
        // đóng dấu lúc request ingest BẮT ĐẦU chứ không phải lúc commit → có thể bỏ sót cuốc vĩnh viễn).
        Schema::table('driver_free_ride_alerts', function (Blueprint $table) {
            $table->unsignedBigInteger('last_pushed_max_id')->nullable()->after('last_pushed_at');
        });

        // Cảnh báo có sẵn: coi như vừa bật lúc migrate — không dội ngược cuốc cũ đang hiển thị.
        DB::table('driver_free_ride_alerts')->update([
            'last_pushed_max_id' => (int) (DB::table('free_rides')->max('id') ?? 0),
        ]);
    }

    public function down(): void
    {
        Schema::table('driver_free_ride_alerts', function (Blueprint $table) {
            $table->dropColumn('last_pushed_max_id');
        });
    }
};
