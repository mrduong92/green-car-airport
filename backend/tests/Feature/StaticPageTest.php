<?php

namespace Tests\Feature;

use App\Models\StaticPage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaticPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_show_returns_active_page(): void
    {
        StaticPage::create([
            'slug' => 'terms', 'title' => 'Điều khoản dịch vụ',
            'content' => '<p>Nội dung</p>', 'is_active' => true,
        ]);

        $response = $this->getJson('/api/pages/terms')->assertOk();

        $response->assertJson([
            'slug' => 'terms', 'title' => 'Điều khoản dịch vụ', 'content' => '<p>Nội dung</p>',
        ]);
    }

    public function test_public_show_returns_404_for_inactive_page(): void
    {
        StaticPage::create([
            'slug' => 'hidden', 'title' => 'Ẩn', 'content' => '<p>x</p>', 'is_active' => false,
        ]);

        $this->getJson('/api/pages/hidden')->assertNotFound();
    }

    public function test_public_show_returns_404_for_missing_slug(): void
    {
        $this->getJson('/api/pages/khong-ton-tai')->assertNotFound();
    }

    public function test_admin_can_create_page(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', [
                'slug' => 'faq', 'title' => 'Câu hỏi thường gặp', 'content' => '<p>Nội dung FAQ</p>',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('static_pages', ['slug' => 'faq', 'title' => 'Câu hỏi thường gặp']);
        $response->assertJson(['slug' => 'faq']);
    }

    public function test_non_admin_cannot_create_page(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'faq', 'title' => 'x', 'content' => '<p>x</p>'])
            ->assertForbidden();
    }

    public function test_create_rejects_invalid_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'Invalid Slug!', 'title' => 'x', 'content' => '<p>x</p>'])
            ->assertStatus(422);
    }

    public function test_create_rejects_duplicate_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        StaticPage::create(['slug' => 'terms', 'title' => 'x', 'content' => '<p>x</p>']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', ['slug' => 'terms', 'title' => 'y', 'content' => '<p>y</p>'])
            ->assertStatus(422);
    }

    public function test_update_cannot_change_slug(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $page  = StaticPage::create(['slug' => 'terms', 'title' => 'Cũ', 'content' => '<p>Cũ</p>']);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/pages/{$page->id}", [
                'slug' => 'da-doi', 'title' => 'Mới', 'content' => '<p>Mới</p>',
            ])
            ->assertOk();

        $this->assertDatabaseHas('static_pages', ['id' => $page->id, 'slug' => 'terms', 'title' => 'Mới']);
    }

    public function test_destroy_soft_hides_instead_of_deleting(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $page  = StaticPage::create(['slug' => 'terms', 'title' => 'x', 'content' => '<p>x</p>']);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/admin/pages/{$page->id}")
            ->assertOk();

        $this->assertDatabaseHas('static_pages', ['id' => $page->id, 'is_active' => false]);
    }

    public function test_content_is_sanitized_on_create(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/pages', [
                'slug' => 'xss', 'title' => 'x',
                'content' => '<p>An toàn</p><script>alert(1)</script><strong>Đậm</strong>',
            ])
            ->assertCreated();

        $this->assertStringNotContainsString('<script>', $response->json('content'));
        $this->assertStringContainsString('<strong>Đậm</strong>', $response->json('content'));
    }
}
