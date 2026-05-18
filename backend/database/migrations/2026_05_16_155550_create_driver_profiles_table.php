<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('driver_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('vehicle_make');
            $table->string('vehicle_model');
            $table->string('vehicle_plate');
            $table->unsignedSmallInteger('vehicle_year');
            $table->string('vehicle_color');
            $table->enum('status', ['active', 'pending', 'blocked'])->default('pending');
            $table->boolean('is_verified')->default(false);
            $table->boolean('is_online')->default(false);
            $table->decimal('rating', 3, 2)->default(5.00);
            $table->unsignedInteger('trips_count')->default(0);
            $table->unsignedInteger('months_active')->default(0);
            $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('driver_profiles'); }
};
