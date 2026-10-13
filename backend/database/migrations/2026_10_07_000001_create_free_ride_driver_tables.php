<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Lưu theo ride_uid (không FK) vì free_rides bị dọn sau khi hết hạn — báo cáo vẫn còn để admin xem.
        Schema::create('free_ride_reports', function (Blueprint $table) {
            $table->id();
            $table->string('free_ride_uid', 64)->index();
            $table->string('sender_uid', 32)->index();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 32);
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'free_ride_uid']);
        });

        Schema::create('driver_hidden_senders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('sender_uid', 32);
            $table->timestamps();

            $table->unique(['driver_id', 'sender_uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_hidden_senders');
        Schema::dropIfExists('free_ride_reports');
    }
};
