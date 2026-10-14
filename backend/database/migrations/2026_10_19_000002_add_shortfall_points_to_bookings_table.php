<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Điểm app CỘNG THÊM cho tài xế lúc nhận cuốc khi phí app (tại tỉ lệ đang
        // áp dụng) không đủ bù hết số điểm khách đã dùng — driverFeePoints() clamp
        // về 0 trong trường hợp này, nên phần vượt phải bù riêng bằng credit để
        // tài xế vẫn nhận đủ phần trăm giá cơ sở của mình. Ghi lại ĐÚNG số đã
        // cộng (không tính lại theo tỉ lệ hiện tại) để refundAcceptCharges() thu
        // hồi chính xác khi cuốc không hoàn tất (huỷ) — tránh cộng dồn khi cuốc
        // quay lại sàn cho tài xế khác nhận.
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedInteger('held_shortfall_points')->default(0)->after('held_surcharge_points');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('held_shortfall_points');
        });
    }
};
