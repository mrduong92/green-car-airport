<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_configs', function (Blueprint $table) {
            $table->id();
            $table->enum('service_type', ['airport', 'provincial']);
            $table->enum('trip_type', ['one_way', 'round_trip'])->default('one_way');
            $table->enum('vehicle_type', ['sedan_4', 'suv_5', 'mpv_7']);
            $table->enum('price_type', ['range', 'per_km']);
            $table->unsignedInteger('min_price');
            $table->unsignedInteger('max_price');
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_configs');
    }
};
