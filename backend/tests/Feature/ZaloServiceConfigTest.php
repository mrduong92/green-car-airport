<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloServiceConfigTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret', 'zalo.ai_daily_budget_usd' => 5.0]);
        $this->travelTo(Carbon::parse('2026-10-06 03:00:00')); // 10:00 giờ VN
    }

    private function signedGet(string $uri)
    {
        $ts = (string) now()->timestamp;
        $sig = hash_hmac('sha256', $ts.'.', 'test-secret');

        return $this->call('GET', $uri, [], [], [], [
            'HTTP_ACCEPT' => 'application/json', 'HTTP_X_ZALO_TIMESTAMP' => $ts, 'HTTP_X_ZALO_SIGNATURE' => $sig,
        ]);
    }

    public function test_groups_sync_upserts_names_without_touching_enabled(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Cũ', 'enabled' => false]);

        $this->zaloPost('/api/internal/zalo/groups', ['groups' => [
            ['zalo_group_id' => 'g1', 'name' => 'Taxi Nội Bài', 'last_message_at' => now()->getTimestampMs(), 'messages_24h' => 420],
            ['zalo_group_id' => 'g2', 'name' => 'Xe ghép HN', 'last_message_at' => null, 'messages_24h' => 0],
        ]])->assertOk()->assertJson(['stored' => 2]);

        $g1 = ZaloGroup::where('zalo_group_id', 'g1')->first();
        $this->assertSame('Taxi Nội Bài', $g1->name);
        $this->assertFalse($g1->enabled);
        $this->assertSame(420, $g1->messages_24h);
        $this->assertTrue(ZaloGroup::where('zalo_group_id', 'g2')->first()->enabled);
    }

    public function test_config_returns_disabled_groups_blocks_budget_and_delivers_qr_requests_once(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'enabled' => false]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'enabled' => true]);
        ZaloSenderBlock::create(['sender_uid' => 'spam1']);
        ZaloQrRefreshRequest::create(['sender_uid' => '111']);
        ZaloQrRefreshRequest::create(['sender_uid' => '111']);

        $this->signedGet('/api/internal/zalo/config')->assertOk()->assertExactJson([
            'disabled_group_ids' => ['g1'],
            'blocked_sender_uids' => ['spam1'],
            'qr_refresh_uids' => ['111'],
            'ai_daily_budget_usd' => 5.0, // PHP encode float 5.0 thành "5.0"
        ]);

        $this->signedGet('/api/internal/zalo/config')->assertOk()->assertJson(['qr_refresh_uids' => []]);
    }

    public function test_config_requires_signature(): void
    {
        $this->getJson('/api/internal/zalo/config')->assertStatus(401);
    }

    public function test_prune_rides_deletes_rides_expired_over_a_day(): void
    {
        $base = ['sender_uid' => '1', 'zalo_group_id' => 'g', 'qr_code' => 'QR1', 'raw_text' => 'x', 'posted_at' => now()];
        FreeRide::create($base + ['ride_uid' => 'old', 'expires_at' => now()->subDays(2)]);
        FreeRide::create($base + ['ride_uid' => 'recent', 'expires_at' => now()->subHours(2)]);

        $this->artisan('zalo:prune-rides')->expectsOutputToContain('Đã xoá 1 cuốc')->assertSuccessful();
        $this->assertSame(['recent'], FreeRide::pluck('ride_uid')->all());
    }

    public function test_status_alerts_when_outbox_backlog_is_large(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60, 'accounts' => [['id' => 'acc1', 'connected' => true]],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
            'outbox_backlog' => 1500, 'ai_queue_size' => 3, 'ai_spent_today_usd' => 1.25, 'ai_budget_usd' => 5,
        ])->assertOk();

        $this->artisan('zalo:service-status')->expectsOutputToContain('hộp thư đi tồn 1500 cuốc')->assertExitCode(1);
    }

    private function phase2Heartbeat(array $extra): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', array_merge([
            'service_id' => 'zalo-1', 'uptime_s' => 60, 'accounts' => [['id' => 'acc1', 'connected' => true]],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
            'outbox_backlog' => 0, 'ai_queue_size' => 0, 'ai_spent_today_usd' => 0, 'ai_budget_usd' => 5,
        ], $extra))->assertOk();
    }

    public function test_status_alerts_when_most_senders_have_no_qr_code(): void
    {
        $this->phase2Heartbeat(['qr_queue_size' => 2, 'held_back_rides' => 10, 'qr_ok_24h' => 3, 'qr_empty_24h' => 17, 'qr_error_24h' => 1]);

        $this->artisan('zalo:service-status')
            ->expectsOutputToContain('Tỷ lệ người bắn không lấy được mã QR bất thường — kiểm tra giải mã QR')
            ->assertExitCode(1);
    }

    public function test_qr_empty_ratio_is_not_an_alert_with_few_samples_or_a_normal_ratio(): void
    {
        $this->phase2Heartbeat(['qr_ok_24h' => 1, 'qr_empty_24h' => 18]); // dưới 20 mẫu
        $this->artisan('zalo:service-status')->assertExitCode(0);

        $this->phase2Heartbeat(['qr_ok_24h' => 5, 'qr_empty_24h' => 20]); // đúng 0.8 → chưa vượt
        $this->artisan('zalo:service-status')->assertExitCode(0);
    }

    public function test_status_alerts_when_many_rides_are_held_back(): void
    {
        $this->phase2Heartbeat(['held_back_rides' => 201]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('201 cuốc bị giữ lại')->assertExitCode(1);

        $this->phase2Heartbeat(['held_back_rides' => 200]);
        $this->artisan('zalo:service-status')->assertExitCode(0);
    }

    public function test_heartbeat_rejects_negative_qr_fields(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60, 'accounts' => [],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => null, 'held_back_rides' => -1,
        ])->assertStatus(422);
    }
}
