<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Mỗi dòng device_tokens giờ là MỘT trong hai loại: Web Push (endpoint + khoá)
 * hoặc FCM (fcm_token) của app native. Ba cột Web Push phải nullable vì dòng
 * FCM không có chúng.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('device_tokens', function (Blueprint $table) {
            $table->string('fcm_token', 255)->nullable()->unique()->after('user_id');
            $table->string('endpoint', 500)->nullable()->change();
            $table->string('p256dh', 500)->nullable()->change();
            $table->string('auth', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('device_tokens')->whereNotNull('fcm_token')->delete();

        Schema::table('device_tokens', function (Blueprint $table) {
            $table->dropUnique(['fcm_token']);
            $table->dropColumn('fcm_token');
            $table->string('endpoint', 500)->nullable(false)->change();
            $table->string('p256dh', 500)->nullable(false)->change();
            $table->string('auth', 100)->nullable(false)->change();
        });
    }
};
