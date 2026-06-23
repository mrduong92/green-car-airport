<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE wallet_transactions MODIFY type ENUM('credit','debit','topup','referral') NOT NULL");
        }
    }
    public function down(): void {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE wallet_transactions MODIFY type ENUM('credit','debit','topup') NOT NULL");
        }
    }
};
