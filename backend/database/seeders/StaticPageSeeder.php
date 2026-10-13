<?php

namespace Database\Seeders;

use App\Models\StaticPage;
use Illuminate\Database\Seeder;

class StaticPageSeeder extends Seeder
{
    public function run(): void
    {
        // updateOrCreate: migration tạo bảng terms_acceptances đã chèn sẵn trang `terms`.
        StaticPage::updateOrCreate(['slug' => 'terms'], [
            'title' => 'Điều khoản sử dụng',
            'content' => file_get_contents(resource_path('legal/terms.html')),
            'is_active' => true,
        ]);

        // firstOrCreate: admin sửa nội dung chính sách trên production — chạy lại seeder không được ghi đè.
        StaticPage::firstOrCreate(['slug' => 'privacy'], [
            'title' => 'Chính sách bảo mật',
            'content' => '<p>Nội dung chính sách bảo mật sẽ được cập nhật sớm.</p>',
            'is_active' => true,
        ]);

        // Link khai báo với Google Play (bắt buộc cho app có tạo tài khoản).
        StaticPage::updateOrCreate(['slug' => 'xoa-tai-khoan'], [
            'title' => 'Xoá tài khoản',
            'content' => file_get_contents(resource_path('legal/delete-account.html')),
            'is_active' => true,
        ]);
    }
}
