<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Voucher chào mừng khách mới: 4 → 20 cái 50k (tổng 1 triệu). Chỉ đụng campaign seed
    // mặc định chưa bị admin đổi tên; admin vẫn chỉnh số lượng/bật tắt ở trang Campaigns.
    public function up(): void
    {
        DB::table('campaigns')
            ->where('name', 'Ra mắt — tặng 200k khách mới')
            ->get()
            ->each(function ($c) {
                $reward = json_decode($c->reward, true);
                $reward['voucher_count'] = 20;
                DB::table('campaigns')->where('id', $c->id)->update([
                    'name'   => 'Ra mắt — tặng 1 triệu khách mới',
                    'reward' => json_encode($reward),
                ]);
            });
    }

    public function down(): void
    {
        DB::table('campaigns')
            ->where('name', 'Ra mắt — tặng 1 triệu khách mới')
            ->get()
            ->each(function ($c) {
                $reward = json_decode($c->reward, true);
                $reward['voucher_count'] = 4;
                DB::table('campaigns')->where('id', $c->id)->update([
                    'name'   => 'Ra mắt — tặng 200k khách mới',
                    'reward' => json_encode($reward),
                ]);
            });
    }
};
