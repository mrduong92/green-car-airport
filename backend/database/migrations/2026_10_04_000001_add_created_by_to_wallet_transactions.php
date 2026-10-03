<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            // Admin thực hiện cộng/trừ điểm thủ công; null với giao dịch tự động
            $table->foreignId('created_by')->nullable()->after('points')->constrained('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
        });
    }
};
