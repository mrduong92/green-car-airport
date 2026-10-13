<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Bằng chứng pháp lý: ai đồng ý phiên bản điều khoản nào, lúc nào, từ đâu.
        // Chỉ ghi thêm — không sửa, không xoá dòng cũ.
        Schema::create('terms_acceptances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('version', 20);
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('accepted_at');
            $table->index(['user_id', 'version']);
        });

        // Đưa nội dung Điều khoản sử dụng (docs/CR/policy.txt) vào trang tĩnh `terms`,
        // ghi đè nội dung tạm "sẽ được cập nhật sớm".
        $content = file_get_contents(resource_path('legal/terms.html'));
        $now = now();

        if (DB::table('static_pages')->where('slug', 'terms')->exists()) {
            DB::table('static_pages')->where('slug', 'terms')->update([
                'title' => 'Điều khoản sử dụng', 'content' => $content, 'is_active' => true, 'updated_at' => $now,
            ]);
        } else {
            DB::table('static_pages')->insert([
                'slug' => 'terms', 'title' => 'Điều khoản sử dụng', 'content' => $content,
                'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('terms_acceptances');
    }
};
