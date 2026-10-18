<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Tài xế đăng cuốc vào tab Free (thay nguồn đọc nhóm Zalo). Cuốc tài xế đăng: posted_by_user_id có giá trị,
// qr_code/zalo_group_id null. Spec: docs/superpowers/specs/2026-10-17-driver-post-ride-design.md
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->string('qr_code', 32)->nullable()->change();
            $table->string('zalo_group_id', 32)->nullable()->change();
            $table->foreignId('posted_by_user_id')->nullable()->after('sender_name')->constrained('users')->nullOnDelete();
            $table->boolean('contact_zalo')->default(true)->after('posted_by_user_id');
            $table->string('parse_status', 16)->nullable()->after('contact_zalo');
            $table->timestamp('closed_at')->nullable()->after('expires_at');
            $table->timestamp('deleted_at')->nullable()->after('closed_at');
            $table->index(['posted_by_user_id', 'posted_at']);
            $table->index('closed_at');
        });

        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->timestamp('free_unlock_requested_at')->nullable()->after('free_unlocked_until');
            $table->timestamp('ride_post_terms_accepted_at')->nullable()->after('free_unlock_requested_at');
        });
    }

    public function down(): void
    {
        // Cột Zalo phải NOT NULL lại → bỏ cuốc tài xế đăng trước.
        DB::table('free_rides')->whereNotNull('posted_by_user_id')->delete();

        Schema::table('free_rides', function (Blueprint $table) {
            $table->dropIndex(['posted_by_user_id', 'posted_at']);
            $table->dropIndex(['closed_at']);
            $table->dropConstrainedForeignId('posted_by_user_id');
            $table->dropColumn(['contact_zalo', 'parse_status', 'closed_at', 'deleted_at']);
            $table->string('qr_code', 32)->nullable(false)->change();
            $table->string('zalo_group_id', 32)->nullable(false)->change();
        });

        Schema::table('driver_profiles', function (Blueprint $table) {
            $table->dropColumn(['free_unlock_requested_at', 'ride_post_terms_accepted_at']);
        });
    }
};
