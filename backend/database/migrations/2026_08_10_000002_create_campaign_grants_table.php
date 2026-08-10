<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained()->cascadeOnDelete();
            // nullOnDelete: khách xoá tài khoản không được xoá luôn sổ phát thưởng, vì
            // khoá chống trùng nằm trên `phone`, không phải `user_id` — xem cột dưới.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            // Bản chụp SĐT lúc phát — khách xoá tài khoản rồi đăng ký lại sẽ có user_id
            // mới, nhưng vẫn cùng SĐT, nên khoá chống trùng phải đặt ở đây.
            $table->string('phone', 20);
            $table->dateTime('granted_at');

            $table->unique(['campaign_id', 'phone'], 'campaign_grants_campaign_id_phone_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_grants');
    }
};
