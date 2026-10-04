<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cuốc sạch do microservice Zalo gửi sang (upsert theo ride_uid). Hết hạn thì zalo:prune-rides xoá.
        Schema::create('free_rides', function (Blueprint $table) {
            $table->id();
            $table->string('ride_uid', 64)->unique();
            $table->string('sender_uid', 32)->index();
            $table->string('sender_name')->default('');
            $table->string('qr_code', 32);
            $table->string('zalo_group_id', 32);
            $table->string('group_name')->default('');
            $table->string('direction', 16)->nullable();
            $table->string('pickup')->nullable();
            $table->string('destination')->nullable();
            $table->timestamp('pickup_at')->nullable();
            $table->string('pickup_time_text', 32)->nullable();
            $table->unsignedTinyInteger('seats')->nullable();
            $table->string('vehicle_note', 32)->nullable();
            $table->unsignedInteger('price')->nullable();
            $table->boolean('is_free')->default(false);
            $table->boolean('is_raw')->default(false);
            $table->text('raw_text');
            $table->unsignedSmallInteger('group_count')->default(1);
            $table->timestamp('posted_at');
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->index(['expires_at', 'posted_at']);
        });

        // Danh sách nhóm do service đồng bộ; cờ enabled do admin quản lý (service không ghi đè).
        Schema::create('zalo_groups', function (Blueprint $table) {
            $table->id();
            $table->string('zalo_group_id', 32)->unique();
            $table->string('name')->default('');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_message_at')->nullable();
            $table->unsignedInteger('messages_24h')->default(0);
            $table->timestamps();
        });

        Schema::create('zalo_sender_blocks', function (Blueprint $table) {
            $table->id();
            $table->string('sender_uid', 32)->unique();
            $table->string('reason')->nullable();
            $table->foreignId('blocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Yêu cầu lấy lại mã QR (tài xế báo link lỗi); service nhận qua GET /config, delivered_at đánh dấu đã giao.
        Schema::create('zalo_qr_refresh_requests', function (Blueprint $table) {
            $table->id();
            $table->string('sender_uid', 32)->index();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zalo_qr_refresh_requests');
        Schema::dropIfExists('zalo_sender_blocks');
        Schema::dropIfExists('zalo_groups');
        Schema::dropIfExists('free_rides');
    }
};
