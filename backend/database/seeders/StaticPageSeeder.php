<?php

namespace Database\Seeders;

use App\Models\StaticPage;
use Illuminate\Database\Seeder;

class StaticPageSeeder extends Seeder
{
    public function run(): void
    {
        StaticPage::create([
            'slug' => 'terms',
            'title' => 'Điều khoản dịch vụ',
            'content' => '<p>Nội dung điều khoản dịch vụ sẽ được cập nhật sớm.</p>',
            'is_active' => true,
        ]);

        StaticPage::create([
            'slug' => 'privacy',
            'title' => 'Chính sách bảo mật',
            'content' => '<p>Nội dung chính sách bảo mật sẽ được cập nhật sớm.</p>',
            'is_active' => true,
        ]);
    }
}
