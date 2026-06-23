<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->string('referral_code', 10)->unique()->nullable()->after('role');
            $table->foreignId('referred_by_user_id')->nullable()->constrained('users')->nullOnDelete()->after('referral_code');
            $table->timestamp('referral_rewarded_at')->nullable()->after('referred_by_user_id');
        });
    }
    public function down(): void {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['referred_by_user_id']);
            $table->dropColumn(['referral_code', 'referred_by_user_id', 'referral_rewarded_at']);
        });
    }
};
