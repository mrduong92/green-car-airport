<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tách "mã OTP còn hạn" khỏi "đã chứng minh sở hữu số điện thoại".
 *
 * Trước đây form đăng ký tài xế chỉ kiểm OTP ở submit CUỐI, trong khi mã sống
 * 5 phút và form có 6 bước (bước 5 bắt tra 7 ô giấy tờ) — quá 5 phút là bình
 * thường, nên tài xế thật liên tục nhận "Mã OTP không hợp lệ hoặc đã hết hạn".
 *
 * `verified_at` ghi mốc người dùng đã nhập đúng OTP ở bước 2. Từ đó bước cuối
 * chỉ cần dấu này (+ `used_at` null), KHÔNG kiểm lại mã và KHÔNG tính thời gian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('otps', function (Blueprint $table) {
            $table->timestamp('verified_at')->nullable()->after('used_at');
        });
    }

    public function down(): void
    {
        Schema::table('otps', function (Blueprint $table) {
            $table->dropColumn('verified_at');
        });
    }
};
