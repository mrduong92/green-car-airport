<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('collection_fee')->default(0)->after('surcharge');
            $table->foreignId('collaborator_id')->nullable()->after('collection_fee')
                  ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropForeign(['collaborator_id']);
            $table->dropColumn(['collection_fee', 'collaborator_id']);
        });
    }
};
