<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Yêu cầu đăng nhập/gỡ nick Zalo phụ do admin tạo; service Node hỏi qua GET
        // /internal/zalo/account-requests (có ký) và báo tiến độ bằng POST .../{id}.
        // Chỉ ảnh QR (qr_image) đi qua Laravel — phiên đăng nhập thật nằm trên VPS service.
        Schema::create('zalo_account_requests', function (Blueprint $table) {
            $table->id();
            $table->string('type', 16); // login | remove
            $table->string('account_id', 32);
            $table->string('status', 16)->default('pending'); // pending → qr_ready → done | expired | failed
            $table->longText('qr_image')->nullable(); // base64 PNG, xoá khi done/expired/failed
            $table->timestamp('qr_expires_at')->nullable();
            $table->string('zalo_uid', 64)->nullable();
            $table->string('zalo_name')->nullable();
            $table->string('error', 500)->nullable();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // Tra "có yêu cầu mở cho account_id này chưa" (409) + lọc pending khi service hỏi.
            $table->index(['account_id', 'status']);
            $table->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zalo_account_requests');
    }
};
