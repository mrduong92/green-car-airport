<?php

namespace Database\Seeders;

use App\Models\StaticPage;
use Illuminate\Database\Seeder;

class StaticPageSeeder extends Seeder
{
    public function run(): void
    {
        // firstOrCreate cho MỌI trang: seeder chạy ở mỗi lần deploy (docs/DEPLOY.md), chỉ được
        // tạo trang còn thiếu — không ghi đè nội dung admin đã sửa, không bật lại trang admin đã tắt.
        // `terms` thường đã có sẵn từ migration tạo bảng terms_acceptances.
        StaticPage::firstOrCreate(['slug' => 'terms'], [
            'title' => 'Điều khoản sử dụng',
            'content' => file_get_contents(resource_path('legal/terms.html')),
            'is_active' => true,
        ]);

        StaticPage::firstOrCreate(['slug' => 'privacy'], [
            'title' => 'Chính sách bảo mật',
            'content' => '<p>Nội dung chính sách bảo mật sẽ được cập nhật sớm.</p>',
            'is_active' => true,
        ]);

        // Link khai báo với Google Play (bắt buộc cho app có tạo tài khoản).
        StaticPage::firstOrCreate(['slug' => 'xoa-tai-khoan'], [
            'title' => 'Xoá tài khoản',
            'content' => file_get_contents(resource_path('legal/delete-account.html')),
            'is_active' => true,
        ]);
    }
}
