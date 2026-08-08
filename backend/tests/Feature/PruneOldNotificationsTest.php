<?php

// backend/tests/Feature/PruneOldNotificationsTest.php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Lệnh xoá dữ liệu thì phải có test cho CẢ hai chiều: xoá đúng thứ cần xoá, và
 * quan trọng hơn — KHÔNG đụng vào thứ phải giữ.
 */
class PruneOldNotificationsTest extends TestCase
{
    use RefreshDatabase;

    private function noti(User $u, int $ngayTruoc, bool $daDoc): string
    {
        $id = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $id,
            'type' => 'App\\Notifications\\BookingCreatedNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => $u->id,
            'data' => json_encode(['title' => 'x']),
            'read_at' => $daDoc ? now()->subDays($ngayTruoc) : null,
            'created_at' => now()->subDays($ngayTruoc),
            'updated_at' => now()->subDays($ngayTruoc),
        ]);

        return $id;
    }

    public function test_xoa_thong_bao_da_doc_qua_han_va_giu_cai_moi(): void
    {
        $u = User::factory()->create(['role' => 'customer']);
        $cu = $this->noti($u, 40, daDoc: true);    // đã đọc, 40 ngày → xoá
        $moi = $this->noti($u, 10, daDoc: true);   // đã đọc, 10 ngày → giữ

        $this->artisan('notifications:prune')->assertSuccessful();

        $this->assertDatabaseMissing('notifications', ['id' => $cu]);
        $this->assertDatabaseHas('notifications', ['id' => $moi]);
    }

    public function test_giu_thong_bao_chu_a_doc_trong_han(): void
    {
        $u = User::factory()->create(['role' => 'customer']);
        // Chưa đọc, 40 ngày: quá ngưỡng "đã đọc" nhưng chưa quá ngưỡng "mọi loại"
        $chuaDoc = $this->noti($u, 40, daDoc: false);

        $this->artisan('notifications:prune')->assertSuccessful();

        $this->assertDatabaseHas('notifications', ['id' => $chuaDoc]);
    }

    public function test_xoa_thong_bao_qua_cu_ke_ca_chua_doc(): void
    {
        $u = User::factory()->create(['role' => 'customer']);
        $ratCu = $this->noti($u, 120, daDoc: false);   // 120 ngày → xoá dù chưa đọc

        $this->artisan('notifications:prune')->assertSuccessful();

        $this->assertDatabaseMissing('notifications', ['id' => $ratCu]);
    }

    public function test_xoa_het_khi_so_dong_vuot_qua_mot_lo(): void
    {
        // Vòng lặp theo lô phải chạy nhiều vòng, không dừng sau lô đầu tiên
        $u = User::factory()->create(['role' => 'customer']);
        for ($i = 0; $i < 25; $i++) {
            $this->noti($u, 100, daDoc: false);
        }

        $this->artisan('notifications:prune', ['--chunk' => 10])->assertSuccessful();

        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_tu_choi_tham_so_vo_ly(): void
    {
        // read-days > all-days sẽ khiến ngưỡng mâu thuẫn nhau
        $this->artisan('notifications:prune', ['--read-days' => 100, '--all-days' => 30])
            ->assertFailed();
    }
}
