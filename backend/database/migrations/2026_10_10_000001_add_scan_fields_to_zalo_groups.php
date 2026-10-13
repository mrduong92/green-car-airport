<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Giai đoạn 4: service quét toàn bộ nhóm, bổ sung số thành viên, nick đang ở và mốc rời nhóm.
        Schema::table('zalo_groups', function (Blueprint $table) {
            $table->unsignedInteger('member_count')->nullable()->after('messages_24h');
            $table->json('accounts')->nullable()->after('member_count');
            $table->timestamp('left_at')->nullable()->after('accounts');
        });
    }

    public function down(): void
    {
        Schema::table('zalo_groups', function (Blueprint $table) {
            $table->dropColumn(['member_count', 'accounts', 'left_at']);
        });
    }
};
