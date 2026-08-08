<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Dọn bảng `notifications`.
 *
 * Bảng này chỉ phình chứ không bao giờ tự co: mỗi sự kiện của mỗi cuốc đều ghi
 * một dòng cho mỗi người liên quan, và không có gì xoá đi. Ở quy mô mục tiêu
 * (5.000 tài xế / 20.000 khách) là hàng triệu dòng mỗi tháng.
 *
 * Xoá theo LÔ thay vì một câu DELETE lớn: bảng notifications dùng khoá chính
 * UUID nên xoá nhiều dòng một lúc sẽ giữ khoá lâu và chặn cả việc ghi thông báo
 * mới. Lệnh này chạy hằng ngày lúc vắng khách.
 */
class PruneOldNotifications extends Command
{
    protected $signature = 'notifications:prune
        {--read-days=30 : Xoá thông báo ĐÃ ĐỌC cũ hơn số ngày này}
        {--all-days=90 : Xoá mọi thông báo cũ hơn số ngày này, kể cả chưa đọc}
        {--chunk=1000 : Số dòng xoá mỗi lô}';

    protected $description = 'Xoá thông báo cũ để bảng notifications không phình vô hạn';

    public function handle(): int
    {
        $readDays = (int) $this->option('read-days');
        $allDays = (int) $this->option('all-days');
        $chunk = max(1, (int) $this->option('chunk'));

        if ($readDays < 1 || $allDays < 1 || $readDays > $allDays) {
            $this->error('read-days và all-days phải >= 1, và read-days không được lớn hơn all-days.');

            return self::FAILURE;
        }

        $daDoc = $this->xoaTheoLo(
            fn () => DB::table('notifications')
                ->whereNotNull('read_at')
                ->where('created_at', '<', now()->subDays($readDays)),
            $chunk,
        );

        $quaCu = $this->xoaTheoLo(
            fn () => DB::table('notifications')
                ->where('created_at', '<', now()->subDays($allDays)),
            $chunk,
        );

        $this->info("Đã xoá {$daDoc} thông báo đã đọc (>{$readDays} ngày) và {$quaCu} thông báo quá cũ (>{$allDays} ngày).");

        return self::SUCCESS;
    }

    /**
     * @param  \Closure():Builder  $query
     */
    private function xoaTheoLo(\Closure $query, int $chunk): int
    {
        $tong = 0;

        // Trần vòng lặp để một lần chạy hỏng không quay vô tận và giữ khoá bảng.
        for ($i = 0; $i < 1000; $i++) {
            $soDong = $query()->limit($chunk)->delete();
            $tong += $soDong;

            if ($soDong < $chunk) {
                break;
            }
        }

        return $tong;
    }
}
