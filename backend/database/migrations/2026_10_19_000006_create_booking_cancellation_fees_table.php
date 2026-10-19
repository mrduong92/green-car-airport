<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phí app app THỰC giữ lại (điểm, có dấu) khi cuốc đã nhận bị KHÁCH huỷ hoặc HỆ THỐNG gỡ
 * (WhitePlateRetirement). Các luồng này hoàn đủ phí cho tài xế nên thường là 0 — chỉ ghi dòng khi
 * khác 0, vd âm khi app bù shortfall lúc nhận mà tài xế đã tiêu, không thu lại được.
 *
 * Bảng riêng, KHÔNG dùng booking_driver_cancellations: bảng đó nghĩa là "tài xế tự bỏ" và đổ vào
 * lịch sử cuốc của tài xế. Cũng không phải cột trên bookings vì một cuốc có thể bị gỡ rồi được
 * nhận lại nhiều lần. Doanh thu/Dashboard cộng theo cancelled_at — xem App\Support\CancelledTripFees.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_cancellation_fees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('cancelled_by', 20); // customer | system
            $table->integer('kept_fee_points');
            $table->timestamp('cancelled_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_cancellation_fees');
    }
};
