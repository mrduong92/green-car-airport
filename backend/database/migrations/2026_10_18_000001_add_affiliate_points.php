<?php

// backend/database/migrations/2026_10_18_000001_add_affiliate_points.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Điểm thưởng affiliate: số dư riêng (không lẫn điểm thu hộ CTV / điểm tài xế trả phí).
// Giao dịch giữ type credit/debit, phân loại bằng balance + kind — không ALTER ENUM vì test chạy sqlite.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $t) {
            $t->unsignedInteger('reward_points')->default(0)->after('points');
        });
        Schema::table('wallet_transactions', function (Blueprint $t) {
            $t->string('balance', 10)->default('points')->after('type');
            $t->string('kind', 20)->nullable()->after('balance');
        });
        Schema::table('bookings', function (Blueprint $t) {
            $t->unsignedInteger('points_used')->default(0)->after('discount');
            $t->unsignedInteger('cashback_points')->nullable()->after('held_surcharge_points');
            $t->unsignedInteger('commission_points')->nullable()->after('cashback_points');
            $t->timestamp('points_refunded_at')->nullable()->after('commission_points');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $t) => $t->dropColumn(['points_used', 'cashback_points', 'commission_points', 'points_refunded_at']));
        Schema::table('wallet_transactions', fn (Blueprint $t) => $t->dropColumn(['balance', 'kind']));
        Schema::table('wallets', fn (Blueprint $t) => $t->dropColumn('reward_points'));
    }
};
