<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('voucher_id')->nullable()->constrained()->nullOnDelete();
            $table->string('pickup');
            $table->string('destination');
            $table->date('date');
            $table->time('time');
            $table->decimal('distance_km', 6, 2);
            $table->unsignedInteger('price');
            $table->unsignedInteger('discount')->default(0);
            $table->enum('status', ['pending','finding_driver','accepted','picking_up','in_progress','completed','cancelled'])->default('finding_driver');
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('bookings'); }
};
