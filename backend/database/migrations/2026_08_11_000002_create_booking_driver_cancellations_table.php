<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ghi lại việc TÀI XẾ tự bỏ một cuốc đã nhận (TripController::cancel()).
 *
 * Khác với BookingController::cancel() (khách huỷ), tài xế bỏ cuốc thì booking
 * KHÔNG chuyển sang status=cancelled — nó quay lại hàng đợi (`finding_driver`,
 * driver_id=null) để tài xế khác nhận. Booking gốc có thể sau đó được hoàn
 * thành bởi một tài xế khác, nên không thể dùng bookings.cancelled_by/
 * cancelled_at để tra lại "tài xế X đã từng bỏ cuốc này" — cần bảng riêng,
 * độc lập với trạng thái hiện tại của booking.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_driver_cancellations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 255)->nullable();
            $table->dateTime('cancelled_at');
            $table->index(['driver_id', 'cancelled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_driver_cancellations');
    }
};
