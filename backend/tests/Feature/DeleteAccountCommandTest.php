<?php

// backend/tests/Feature/DeleteAccountCommandTest.php

namespace Tests\Feature;

use App\Models\StaticPage;
use App\Models\User;
use App\Models\Wallet;
use Database\Seeders\StaticPageSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeleteAccountCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_xoa_sau_khi_xac_nhan(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'phone' => '0903444555']);

        $this->artisan('account:delete', ['phone' => '0903444555', 'role' => 'customer'])
            ->expectsConfirmation("Xoá tài khoản #{$user->id} {$user->name} (0903444555, customer)? Không thể khôi phục.", 'yes')
            ->assertSuccessful();

        $this->assertTrue($user->fresh()->isDeleted());
    }

    public function test_bi_khoa_can_force(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'phone' => '0903444556', 'is_blocked' => true]);

        $this->artisan('account:delete', ['phone' => '0903444556', 'role' => 'customer'])
            ->expectsOutputToContain('Tài khoản đang bị khoá')
            ->assertFailed();

        $this->artisan('account:delete', ['phone' => '0903444556', 'role' => 'customer', '--force' => true])
            ->expectsConfirmation("Xoá tài khoản #{$user->id} {$user->name} (0903444556, customer)? Không thể khôi phục.", 'yes')
            ->assertSuccessful();
    }

    public function test_force_van_chan_vi_con_diem(): void
    {
        $user = User::factory()->create(['role' => 'driver', 'phone' => '0903444557']);
        Wallet::create(['user_id' => $user->id, 'points' => 5]);

        $this->artisan('account:delete', ['phone' => '0903444557', 'role' => 'driver', '--force' => true])
            ->expectsOutputToContain('Ví của bạn còn 5 điểm')
            ->assertFailed();
    }

    public function test_seeder_tao_trang_xoa_tai_khoan(): void
    {
        $this->seed(StaticPageSeeder::class);

        $page = StaticPage::where('slug', 'xoa-tai-khoan')->firstOrFail();
        $this->assertTrue((bool) $page->is_active);
        $this->assertStringContainsString('Xoá tài khoản', $page->content);
        $this->getJson('/api/pages/xoa-tai-khoan')->assertOk();
    }

    /** Seeder chạy ở MỖI lần deploy: không được ghi đè trang admin đã sửa hay bật lại trang đã tắt. */
    public function test_seeder_khong_ghi_de_trang_admin_da_sua_hoac_da_tat(): void
    {
        StaticPage::where('slug', 'terms')->update(['content' => '<p>Terms admin sửa</p>', 'is_active' => false]);
        StaticPage::create(['slug' => 'privacy', 'title' => 'Chính sách bảo mật', 'content' => '<p>Bản thật</p>', 'is_active' => true]);
        StaticPage::create(['slug' => 'xoa-tai-khoan', 'title' => 'Xoá tài khoản', 'content' => '<p>Thêm hotline</p>', 'is_active' => false]);

        $this->seed(StaticPageSeeder::class);

        $this->assertDatabaseHas('static_pages', ['slug' => 'terms', 'content' => '<p>Terms admin sửa</p>', 'is_active' => false]);
        $this->assertDatabaseHas('static_pages', ['slug' => 'privacy', 'content' => '<p>Bản thật</p>']);
        $this->assertDatabaseHas('static_pages', ['slug' => 'xoa-tai-khoan', 'content' => '<p>Thêm hotline</p>', 'is_active' => false]);
    }
}
