<?php

namespace Tests\Feature;

use App\Models\StaticPage;
use App\Models\User;
use Database\Seeders\StaticPageSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TermsAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['terms.version' => '2026-10-10']);
    }

    private function user(string $role = 'customer'): User
    {
        return User::create([
            'phone' => '09'.random_int(10000000, 99999999),
            'name' => 'Test',
            'password' => bcrypt('123456'),
            'role' => $role,
        ]);
    }

    public function test_existing_user_without_acceptance_needs_to_accept(): void
    {
        Sanctum::actingAs($this->user());

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('needs_terms_acceptance', true);
    }

    public function test_accept_records_evidence_and_clears_flag(): void
    {
        $user = $this->user('driver');
        Sanctum::actingAs($user);

        $this->withHeader('User-Agent', 'GreenCA-Test/1.0')
            ->postJson('/api/auth/terms/accept')
            ->assertOk()
            ->assertJsonPath('needs_terms_acceptance', false);

        $this->assertDatabaseHas('terms_acceptances', [
            'user_id' => $user->id,
            'version' => '2026-10-10',
            'ip' => '127.0.0.1',
            'user_agent' => 'GreenCA-Test/1.0',
        ]);

        $this->getJson('/api/auth/me')->assertJsonPath('needs_terms_acceptance', false);
    }

    public function test_bumping_version_requires_acceptance_again(): void
    {
        Sanctum::actingAs($this->user());
        $this->postJson('/api/auth/terms/accept')->assertOk();

        config(['terms.version' => '2027-01-01']);

        $this->getJson('/api/auth/me')->assertJsonPath('needs_terms_acceptance', true);
    }

    public function test_accepting_twice_keeps_history_append_only(): void
    {
        $user = $this->user();
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/terms/accept')->assertOk();
        config(['terms.version' => '2027-01-01']);
        $this->postJson('/api/auth/terms/accept')->assertOk();

        $this->assertDatabaseCount('terms_acceptances', 2);
        $this->assertDatabaseHas('terms_acceptances', ['user_id' => $user->id, 'version' => '2026-10-10']);
    }

    public function test_admin_never_needs_to_accept(): void
    {
        Sanctum::actingAs($this->user('admin'));

        $this->getJson('/api/auth/me')->assertJsonPath('needs_terms_acceptance', false);
    }

    public function test_accept_requires_authentication(): void
    {
        $this->postJson('/api/auth/terms/accept')->assertUnauthorized();
    }

    public function test_customer_register_with_accept_terms_records_acceptance(): void
    {
        $this->postJson('/api/auth/register', [
            'phone' => '0903333333',
            'password' => '123456',
            'accept_terms' => true,
        ])
            ->assertOk()
            ->assertJsonPath('user.needs_terms_acceptance', false);

        $user = User::where('phone', '0903333333')->first();
        $this->assertDatabaseHas('terms_acceptances', ['user_id' => $user->id, 'version' => '2026-10-10']);
    }

    public function test_customer_register_without_accept_terms_still_works_but_needs_acceptance(): void
    {
        // App cũ đã cache trên máy chưa gửi accept_terms — không được chặn đăng ký,
        // popup trong app sẽ bắt đồng ý ngay sau đó.
        $this->postJson('/api/auth/register', [
            'phone' => '0904444444',
            'password' => '123456',
        ])
            ->assertOk()
            ->assertJsonPath('user.needs_terms_acceptance', true);

        $this->assertDatabaseCount('terms_acceptances', 0);
    }

    public function test_login_payload_carries_flag(): void
    {
        $this->user()->update(['phone' => '0905555555']);

        $this->postJson('/api/auth/login', [
            'phone' => '0905555555',
            'password' => '123456',
            'role' => 'customer',
        ])
            ->assertOk()
            ->assertJsonPath('user.needs_terms_acceptance', true);
    }

    public function test_terms_page_contains_policy_text(): void
    {
        $this->seed(StaticPageSeeder::class);

        $page = StaticPage::where('slug', 'terms')->first();
        $this->assertSame('Điều khoản sử dụng', $page->title);
        $this->assertStringContainsString('Quỹ Bảo An', $page->content);
        $this->assertStringContainsString('Điều 5. Hiệu lực thi hành', $page->content);
    }
}
