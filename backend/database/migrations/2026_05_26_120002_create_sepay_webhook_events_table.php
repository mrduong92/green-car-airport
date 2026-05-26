<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('sepay_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sepay_id')->unique();
            $table->string('gateway')->nullable();
            $table->string('account_number')->nullable();
            $table->string('sub_account')->nullable();
            $table->string('code')->nullable();
            $table->text('content')->nullable();
            $table->enum('transfer_type', ['in', 'out']);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('amount')->default(0);
            $table->unsignedBigInteger('accumulated')->nullable();
            $table->string('reference_code')->nullable();
            $table->dateTime('transaction_date')->nullable();
            $table->enum('status', ['processed', 'unmatched', 'ignored'])->index();
            $table->foreignId('matched_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('wallet_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();
            $table->json('raw_payload');
            $table->timestamps();

            $table->index(['transfer_type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sepay_webhook_events');
    }
};
