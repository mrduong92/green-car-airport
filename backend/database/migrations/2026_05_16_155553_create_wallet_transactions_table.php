<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['credit', 'debit', 'topup', 'referral']);
            $table->string('description');
            $table->unsignedInteger('points');
            $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('wallet_transactions'); }
};
