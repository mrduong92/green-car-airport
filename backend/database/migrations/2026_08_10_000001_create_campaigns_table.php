<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            // string, KHÔNG phải enum có chủ đích — xem App\Support\CampaignTrigger.
            // Thêm loại event mới chỉ là sửa code, không ALTER TABLE trên bảng đang chạy.
            $table->string('trigger', 50);
            $table->json('reward');
            // Chưa dùng — cột để sẵn cho lọc theo thuộc tính khách (xem
            // docs/superpowers/specs/2026-08-10-campaign-voucher-design.md — "Mở rộng sau này").
            $table->json('conditions')->nullable();
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->unsignedInteger('max_grants')->nullable();
            $table->unsignedInteger('grants_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'trigger'], 'campaigns_is_active_trigger_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaigns');
    }
};
