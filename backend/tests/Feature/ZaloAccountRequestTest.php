<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ZaloAccountRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloAccountRequestTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-11 10:00:00'));
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function signedGet(string $uri)
    {
        $ts = (string) now()->timestamp;
        $sig = hash_hmac('sha256', $ts.'.', 'test-secret');

        return $this->call('GET', $uri, [], [], [], [
            'HTTP_ACCEPT' => 'application/json', 'HTTP_X_ZALO_TIMESTAMP' => $ts, 'HTTP_X_ZALO_SIGNATURE' => $sig,
        ]);
    }

    // ── Nội bộ (service) ─────────────────────────────────────────────────────

    public function test_internal_list_requires_signature(): void
    {
        $this->getJson('/api/internal/zalo/account-requests')->assertStatus(401);
    }

    public function test_internal_update_requires_signature(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->postJson("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'done'])
            ->assertStatus(401);
    }

    public function test_internal_list_returns_only_pending_oldest_first_limit_5(): void
    {
        for ($i = 1; $i <= 6; $i++) {
            ZaloAccountRequest::create(['type' => 'login', 'account_id' => "acc{$i}", 'status' => 'pending']);
        }
        ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'qr-acc', 'status' => 'qr_ready']);
        ZaloAccountRequest::create(['type' => 'remove', 'account_id' => 'done-acc', 'status' => 'done']);

        $res = $this->signedGet('/api/internal/zalo/account-requests')->assertOk();
        $requests = $res->json('requests');

        $this->assertCount(5, $requests);
        $this->assertSame(['acc1', 'acc2', 'acc3', 'acc4', 'acc5'], array_column($requests, 'account_id'));
        $this->assertSame(['id', 'type', 'account_id'], array_keys($requests[0]));
    }

    public function test_internal_update_moves_pending_to_qr_ready_then_done(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", [
            'status' => 'qr_ready', 'qr_image' => 'data:image/png;base64,AAA', 'qr_expires_at' => now()->addMinute()->getTimestampMs(),
        ])->assertOk();

        $req->refresh();
        $this->assertSame('qr_ready', $req->status);
        $this->assertSame('data:image/png;base64,AAA', $req->qr_image);
        $this->assertNotNull($req->qr_expires_at);

        // QR hết hạn, service tạo QR mới (qr_ready → qr_ready lặp lại).
        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", [
            'status' => 'qr_ready', 'qr_image' => 'data:image/png;base64,BBB', 'qr_expires_at' => now()->addMinute()->getTimestampMs(),
        ])->assertOk();
        $this->assertSame('data:image/png;base64,BBB', $req->refresh()->qr_image);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", [
            'status' => 'done', 'zalo_uid' => 'uid1', 'zalo_name' => 'Nick Một',
        ])->assertOk();

        $req->refresh();
        $this->assertSame('done', $req->status);
        $this->assertNull($req->qr_image);
        $this->assertSame('uid1', $req->zalo_uid);
        $this->assertSame('Nick Một', $req->zalo_name);
    }

    public function test_internal_update_pending_straight_to_done_for_remove(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'remove', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'done'])->assertOk();

        $this->assertSame('done', $req->refresh()->status);
    }

    public function test_internal_update_qr_ready_to_expired_clears_image_and_keeps_error(): void
    {
        $req = ZaloAccountRequest::create([
            'type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready', 'qr_image' => 'img',
        ]);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", [
            'status' => 'expired', 'error' => 'Hết lượt mã QR',
        ])->assertOk();

        $req->refresh();
        $this->assertSame('expired', $req->status);
        $this->assertNull($req->qr_image);
        $this->assertSame('Hết lượt mã QR', $req->error);
    }

    public function test_internal_update_failed_clears_image_and_stores_error(): void
    {
        $req = ZaloAccountRequest::create([
            'type' => 'login', 'account_id' => 'acc1', 'status' => 'pending',
        ]);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", [
            'status' => 'failed', 'error' => 'Lỗi đăng nhập',
        ])->assertOk();

        $req->refresh();
        $this->assertSame('failed', $req->status);
        $this->assertSame('Lỗi đăng nhập', $req->error);
    }

    public function test_internal_update_rejects_invalid_transition_from_terminal_status(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'done']);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'qr_ready', 'qr_image' => 'x'])
            ->assertStatus(409);

        $this->assertSame('done', $req->refresh()->status);
    }

    public function test_internal_update_rejects_pending_to_expired_directly(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'expired', 'error' => 'x'])
            ->assertStatus(409);

        $this->assertSame('pending', $req->refresh()->status);
    }

    public function test_internal_update_unknown_id_is_not_found(): void
    {
        $this->zaloPost('/api/internal/zalo/account-requests/999999', ['status' => 'done'])->assertStatus(404);
    }

    public function test_internal_update_validates_status_value(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'pending'])->assertStatus(422);
        $this->zaloPost("/api/internal/zalo/account-requests/{$req->id}", ['status' => 'bogus'])->assertStatus(422);
    }

    public function test_pending_or_qr_ready_older_than_ten_minutes_expires_lazily_on_internal_read(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready', 'qr_image' => 'img']);
        $req->forceFill(['updated_at' => now()->subMinutes(11)])->save();

        $this->signedGet('/api/internal/zalo/account-requests')->assertOk();

        $req->refresh();
        $this->assertSame('expired', $req->status);
        $this->assertNull($req->qr_image);
    }

    public function test_expire_account_requests_command_expires_stale_requests(): void
    {
        $req = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);
        $req->forceFill(['updated_at' => now()->subMinutes(15)])->save();
        $fresh = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc2', 'status' => 'pending']);

        $this->artisan('zalo:expire-account-requests')->assertSuccessful();

        $this->assertSame('expired', $req->refresh()->status);
        $this->assertSame('pending', $fresh->refresh()->status);
    }

    // ── Heartbeat: trường nick mới ───────────────────────────────────────────

    public function test_heartbeat_accepts_new_nick_fields_and_old_payload(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60,
            'accounts' => [[
                'id' => 'acc1', 'connected' => true, 'logged_in' => true,
                'zalo_uid' => 'uid1', 'zalo_name' => 'Nick Một', 'logged_in_at' => now()->getTimestampMs(), 'groups' => 12,
            ]],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
        ])->assertOk();

        // Payload cũ (không có trường nick mới) vẫn phải được chấp nhận.
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-2', 'uptime_s' => 60,
            'accounts' => [['id' => 'acc2', 'connected' => true]],
            'received_total' => 0, 'stored_total' => 0, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => null,
        ])->assertOk();
    }

    public function test_heartbeat_truncates_long_nick_fields_instead_of_rejecting(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60,
            'accounts' => [[
                'id' => 'acc1', 'connected' => true,
                'zalo_uid' => str_repeat('u', 300), 'zalo_name' => str_repeat('n', 300),
            ]],
            'received_total' => 0, 'stored_total' => 0, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => null,
        ])->assertOk();
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    public function test_admin_accounts_endpoints_forbidden_for_non_admin(): void
    {
        $driver = User::factory()->create(['role' => 'driver']);

        $this->actingAs($driver, 'sanctum')->getJson('/api/admin/free-rides/accounts')->assertForbidden();
        $this->actingAs($driver, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => 'acc1'])->assertForbidden();
        $this->actingAs($driver, 'sanctum')->deleteJson('/api/admin/free-rides/accounts/acc1')->assertForbidden();
    }

    public function test_admin_can_list_accounts_from_heartbeat_with_requests(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60,
            'accounts' => [[
                'id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null,
                'zalo_uid' => 'uid1', 'zalo_name' => 'Nick Một', 'logged_in_at' => now()->getTimestampMs(), 'groups' => 5,
            ]],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
        ])->assertOk();

        $openReq = ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc2', 'status' => 'qr_ready']);
        ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc3', 'status' => 'done']);

        $res = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/free-rides/accounts')->assertOk();

        $accounts = $res->json('accounts');
        $this->assertCount(1, $accounts);
        $this->assertSame('acc1', $accounts[0]['id']);
        $this->assertSame('uid1', $accounts[0]['zalo_uid']);
        $this->assertSame('Nick Một', $accounts[0]['zalo_name']);
        $this->assertSame(5, $accounts[0]['groups']);
        $this->assertSame('zalo-1', $accounts[0]['service_id']);
        $this->assertFalse($accounts[0]['stale']);

        $requests = $res->json('requests');
        $this->assertCount(1, $requests);
        $this->assertSame($openReq->id, $requests[0]['id']);
    }

    public function test_admin_creates_login_request(): void
    {
        $res = $this->actingAs($this->admin(), 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => 'acc1']);

        $res->assertStatus(201)->assertJson(['type' => 'login', 'account_id' => 'acc1', 'status' => 'pending']);
        $this->assertDatabaseHas('zalo_account_requests', ['account_id' => 'acc1', 'type' => 'login', 'status' => 'pending']);
    }

    public function test_admin_create_rejects_invalid_account_id_pattern(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => 'ACC_1'])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => str_repeat('a', 33)])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => ''])->assertStatus(422);
    }

    public function test_admin_create_conflicts_when_open_request_exists(): void
    {
        ZaloAccountRequest::create(['type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready']);
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => 'acc1'])->assertStatus(409);

        // Yêu cầu đã xong (done) không còn "mở" — tạo lại (đăng nhập lại) phải được phép.
        ZaloAccountRequest::query()->update(['status' => 'done']);
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/accounts', ['account_id' => 'acc1'])->assertStatus(201);
    }

    public function test_admin_creates_remove_request_via_delete(): void
    {
        $res = $this->actingAs($this->admin(), 'sanctum')->deleteJson('/api/admin/free-rides/accounts/acc1');

        $res->assertStatus(201)->assertJson(['type' => 'remove', 'account_id' => 'acc1', 'status' => 'pending']);
        $this->assertDatabaseHas('zalo_account_requests', ['account_id' => 'acc1', 'type' => 'remove', 'status' => 'pending']);
    }

    public function test_admin_remove_conflicts_when_open_request_exists(): void
    {
        ZaloAccountRequest::create(['type' => 'remove', 'account_id' => 'acc1', 'status' => 'pending']);

        $this->actingAs($this->admin(), 'sanctum')->deleteJson('/api/admin/free-rides/accounts/acc1')->assertStatus(409);
    }

    public function test_admin_can_poll_single_account_request_with_qr_image(): void
    {
        $req = ZaloAccountRequest::create([
            'type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready',
            'qr_image' => 'data:image/png;base64,AAA', 'qr_expires_at' => now()->addMinute(),
        ]);

        $res = $this->actingAs($this->admin(), 'sanctum')->getJson("/api/admin/free-rides/account-requests/{$req->id}")->assertOk();

        $res->assertJson([
            'id' => $req->id, 'type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready',
            'qr_image' => 'data:image/png;base64,AAA',
        ]);
        $this->assertSame(['id', 'type', 'account_id', 'status', 'qr_image', 'qr_expires_at', 'zalo_name', 'error'], array_keys($res->json()));
        $this->assertIsInt($res->json('qr_expires_at'));
    }

    public function test_admin_poll_unknown_request_is_not_found(): void
    {
        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/free-rides/account-requests/999999')->assertStatus(404);
    }

    public function test_admin_poll_expires_stale_qr_ready_request(): void
    {
        $req = ZaloAccountRequest::create([
            'type' => 'login', 'account_id' => 'acc1', 'status' => 'qr_ready', 'qr_image' => 'img',
        ]);
        $req->forceFill(['updated_at' => now()->subMinutes(11)])->save();

        $res = $this->actingAs($this->admin(), 'sanctum')->getJson("/api/admin/free-rides/account-requests/{$req->id}")->assertOk();

        $this->assertSame('expired', $res->json('status'));
        $this->assertNull($res->json('qr_image'));
    }
}
