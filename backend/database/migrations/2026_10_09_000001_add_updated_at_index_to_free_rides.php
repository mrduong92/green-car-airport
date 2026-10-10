<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// max(updated_at) chạy ở mốc `latest` của tab Free và mỗi lần phát tín hiệu realtime — có index
// thì MySQL lấy thẳng từ đầu cây index thay vì quét cả bảng.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->index('updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->dropIndex(['updated_at']);
        });
    }
};
