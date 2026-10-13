<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Cuốc trùng của CÙNG một người (cùng qr_code, cùng nội dung) do nick phụ khác nghe được ở nhóm
// khác: vẫn lưu nhưng trỏ về cuốc gốc. nullOnDelete: cuốc gốc bị zalo:prune-rides xoá thì bản trùng
// tự thành cuốc độc lập (FreeRide::scopeVisibleTo cũng đã coi bản trùng của cuốc gốc hết hạn/mất là hiển thị).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->foreignId('duplicate_of_id')->nullable()->after('qr_code')
                ->constrained('free_rides')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('free_rides', function (Blueprint $table) {
            $table->dropConstrainedForeignId('duplicate_of_id');
        });
    }
};
