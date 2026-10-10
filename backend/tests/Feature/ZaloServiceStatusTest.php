<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloServiceStatusTest extends TestCase
{
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-05 10:00:00'));
    }

    private function heartbeat(array $overrides = []): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', array_merge([
            'service_id'       => 'zalo-1',
            'uptime_s'         => 120,
            'accounts'         => [['id' => 'acc1', 'connected' => true], ['id' => 'acc2', 'connected' => true]],
            'received_total'   => 10,
            'stored_total'     => 9,
            'duplicates_total' => 3,
            'skipped_non_text' => 1,
            'last_message_at'  => now()->subMinute()->getTimestampMs(),
        ], $overrides))->assertOk()->assertJson(['ok' => true]);
    }

    public function test_no_service_ever_reported_exits_2(): void
    {
        $this->artisan('zalo:service-status')->assertExitCode(2);
    }

    public function test_fresh_heartbeat_with_recent_messages_exits_0(): void
    {
        $this->heartbeat();

        $this->artisan('zalo:service-status')->expectsOutputToContain('zalo-1: OK (2 tài khoản')->assertExitCode(0);
    }

    public function test_stale_heartbeat_exits_1(): void
    {
        $this->heartbeat();
        $this->travel(4)->minutes();

        $this->artisan('zalo:service-status')->expectsOutputToContain('mất heartbeat')->assertExitCode(1);
    }

    public function test_disconnected_account_exits_1_and_names_it(): void
    {
        $this->heartbeat(['accounts' => [['id' => 'acc1', 'connected' => true], ['id' => 'acc2', 'connected' => false]]]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('mất kết nối: acc2')->assertExitCode(1);
    }

    public function test_no_accounts_exits_1(): void
    {
        $this->heartbeat(['accounts' => []]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('không có tài khoản')->assertExitCode(1);
    }

    public function test_silence_during_active_hours_exits_1(): void
    {
        $this->heartbeat(['last_message_at' => now()->subMinutes(11)->getTimestampMs()]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('Không có tin mới')->assertExitCode(1);
    }

    // App chạy timezone UTC; khung 5h–23h phải tính theo giờ Việt Nam.
    public function test_silence_outside_active_hours_is_not_an_alert(): void
    {
        $this->travelTo(Carbon::parse('2026-10-05 02:00:00', 'Asia/Ho_Chi_Minh')); // = 19:00 UTC
        $this->heartbeat(['last_message_at' => null]);

        $this->artisan('zalo:service-status')->assertExitCode(0);
    }

    public function test_silence_in_vietnam_morning_alerts_even_though_utc_is_night(): void
    {
        $this->travelTo(Carbon::parse('2026-10-05 10:00:00', 'Asia/Ho_Chi_Minh')); // = 03:00 UTC
        $this->heartbeat(['last_message_at' => null]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('Không có tin mới')->assertExitCode(1);
    }

    public function test_service_silent_for_over_7_days_is_dropped_from_registry(): void
    {
        $this->heartbeat();
        $this->travel(8)->days();

        $this->artisan('zalo:service-status')->expectsOutputToContain('Chưa có service')->assertExitCode(2);
    }

    public function test_invalid_heartbeat_is_422(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', ['service_id' => 'zalo-1'])->assertStatus(422);
    }
}
