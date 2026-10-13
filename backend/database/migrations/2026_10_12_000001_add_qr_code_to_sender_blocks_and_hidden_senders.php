<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Zalo cấp uid KHÁC NHAU cho cùng một người tuỳ nick phụ nào nhìn thấy họ — mã QR hồ sơ
 * (free_rides.qr_code) mới là danh tính thật. Chặn (admin) / ẩn (tài xế) chuyển sang khoá theo
 * qr_code để áp lên mọi uid của cùng người; hàng cũ chỉ có sender_uid vẫn được tôn trọng.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('zalo_sender_blocks', function (Blueprint $table) {
            $table->string('sender_uid', 32)->nullable()->change();
            $table->string('qr_code', 32)->nullable()->unique()->after('sender_uid');
        });

        Schema::table('driver_hidden_senders', function (Blueprint $table) {
            $table->string('sender_uid', 32)->nullable()->change();
            $table->string('qr_code', 32)->nullable()->after('sender_uid');
            $table->unique(['driver_id', 'qr_code']); // kiêm index cho truy vấn ẩn theo tài xế
        });

        $this->backfill('zalo_sender_blocks', fn ($row) => 'all');
        $this->backfill('driver_hidden_senders', fn ($row) => (string) $row->driver_id);
    }

    public function down(): void
    {
        // Hàng chỉ có qr_code không biểu diễn được ở lược đồ cũ (sender_uid bắt buộc).
        DB::table('zalo_sender_blocks')->whereNull('sender_uid')->delete();
        DB::table('driver_hidden_senders')->whereNull('sender_uid')->delete();

        Schema::table('driver_hidden_senders', function (Blueprint $table) {
            $table->dropUnique(['driver_id', 'qr_code']);
            $table->dropColumn('qr_code');
        });
        Schema::table('driver_hidden_senders', function (Blueprint $table) {
            $table->string('sender_uid', 32)->nullable(false)->change();
        });

        Schema::table('zalo_sender_blocks', function (Blueprint $table) {
            $table->dropUnique(['qr_code']);
            $table->dropColumn('qr_code');
        });
        Schema::table('zalo_sender_blocks', function (Blueprint $table) {
            $table->string('sender_uid', 32)->nullable(false)->change();
        });
    }

    /**
     * Điền qr_code từ cuốc mới nhất của sender_uid. Trong cùng phạm vi unique ($scope: toàn bảng
     * với chặn, từng tài xế với ẩn) chỉ hàng đầu tiên của một hồ sơ nhận qr_code; hàng trùng giữ
     * NULL — vẫn có hiệu lực theo sender_uid nên không mất chặn/ẩn nào.
     */
    private function backfill(string $table, Closure $scope): void
    {
        $taken = [];
        DB::table($table)->whereNotNull('sender_uid')->whereNull('qr_code')->orderBy('id')
            ->each(function ($row) use ($table, $scope, &$taken) {
                $qr = DB::table('free_rides')->where('sender_uid', $row->sender_uid)
                    ->orderByDesc('posted_at')->orderByDesc('id')->value('qr_code');
                if ($qr === null) {
                    return;
                }
                $key = $scope($row).'|'.$qr;
                if (isset($taken[$key])) {
                    return;
                }
                $taken[$key] = true;
                DB::table($table)->where('id', $row->id)->update(['qr_code' => $qr]);
            });
    }
};
