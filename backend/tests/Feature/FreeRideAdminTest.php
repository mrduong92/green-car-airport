<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\User;
use App\Models\ZaloGroup;
use App\Models\ZaloSenderBlock;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class FreeRideAdminTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-09 10:00:00'));
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function driver(string $status = 'active'): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
        ]);

        return $driver;
    }

    private function ride(array $overrides = []): FreeRide
    {
        static $n = 0;
        $n++;

        return FreeRide::create(array_merge([
            'ride_uid' => "s-$n", 'sender_uid' => 'A1', 'sender_name' => 'Người A', 'qr_code' => 'code'.$n,
            'zalo_group_id' => 'g1', 'group_name' => 'Nhóm Một', 'direction' => 'to_airport',
            'pickup' => "điểm $n", 'destination' => 'Sân bay', 'pickup_at' => now()->addHour(),
            'pickup_time_text' => '9h', 'seats' => 4, 'price' => 100000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => "raw $n", 'group_count' => 1, 'posted_at' => now(), 'expires_at' => now()->addHours(2),
        ], $overrides));
    }

    public function test_non_admin_is_forbidden(): void
    {
        $driver = $this->driver();
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($driver, 'sanctum')->getJson('/api/admin/free-rides/groups')->assertForbidden();
        $this->actingAs($customer, 'sanctum')->getJson('/api/admin/free-rides/groups')->assertForbidden();
    }

    public function test_groups_list_filters_and_sorts(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Sân Bay Một', 'enabled' => true, 'messages_24h' => 50]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'name' => 'Nhóm Tắt', 'enabled' => false, 'messages_24h' => 20]);
        ZaloGroup::create(['zalo_group_id' => 'g3', 'name' => 'Nhóm Đã Rời', 'enabled' => true, 'messages_24h' => 99, 'left_at' => now()]);
        $admin = $this->admin();

        $default = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups')->assertOk();
        $this->assertSame(['g1', 'g2'], array_column($default->json('data'), 'zalo_group_id'));
        $this->assertSame(2, $default->json('meta.total'));
        $this->assertSame(1, $default->json('meta.current_page'));
        $this->assertSame(1, $default->json('meta.last_page'));

        $disabled = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups?status=disabled')->assertOk();
        $this->assertSame(['g2'], array_column($disabled->json('data'), 'zalo_group_id'));

        $left = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups?status=left')->assertOk();
        $this->assertSame(['g3'], array_column($left->json('data'), 'zalo_group_id'));
        $this->assertTrue($left->json('data.0.left'));

        $searched = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups?q='.urlencode('Sân Bay'))->assertOk();
        $this->assertSame(['g1'], array_column($searched->json('data'), 'zalo_group_id'));
    }

    public function test_toggle_group(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Một', 'enabled' => true]);
        $admin = $this->admin();

        $res = $this->actingAs($admin, 'sanctum')->patchJson('/api/admin/free-rides/groups/g1', ['enabled' => false])->assertOk();
        $this->assertFalse($res->json('enabled'));
        $this->assertDatabaseHas('zalo_groups', ['zalo_group_id' => 'g1', 'enabled' => false]);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/admin/free-rides/groups/khong-co', ['enabled' => true])->assertNotFound();
    }

    public function test_senders_list_aggregates_rides_reports_and_block_state(): void
    {
        $r1 = $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Người A', 'posted_at' => now()->subHour(), 'expires_at' => now()->addHour()]);
        $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Người A', 'posted_at' => now()->subMinutes(30), 'expires_at' => now()->addHours(2)]);
        $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Người A', 'posted_at' => now()->subDays(3), 'expires_at' => now()->subDays(2)]);
        ZaloSenderBlock::create(['sender_uid' => 'B1', 'reason' => 'spam']);

        FreeRideReport::create(['free_ride_uid' => $r1->ride_uid, 'sender_uid' => 'A1', 'driver_id' => $this->driver()->id, 'reason' => 'spam']);

        $admin = $this->admin();

        $list = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->assertOk();
        $rows = collect($list->json('data'))->keyBy('sender_uid');
        $this->assertSame(2, $rows['A1']['active_rides']);
        $this->assertSame(3, $rows['A1']['rides_7d']);
        $this->assertSame(1, $rows['A1']['reports']);
        $this->assertFalse($rows['A1']['blocked']);
        $this->assertArrayNotHasKey('B1', $rows->all());

        $blockedOnly = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders?blocked=1')->assertOk();
        $this->assertSame(['B1'], array_column($blockedOnly->json('data'), 'sender_uid'));
        $this->assertTrue($blockedOnly->json('data.0.blocked'));
    }

    public function test_block_and_unblock_sender(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/S1/block', ['reason' => 'spam'])
            ->assertOk()->assertJson(['blocked' => true]);
        $this->assertDatabaseHas('zalo_sender_blocks', ['sender_uid' => 'S1', 'reason' => 'spam', 'blocked_by' => $admin->id]);

        // Gọi lại (idempotent) không lỗi.
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/S1/block', ['reason' => 'spam lại'])
            ->assertOk()->assertJson(['blocked' => true]);
        $this->assertDatabaseCount('zalo_sender_blocks', 1);

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/free-rides/senders/S1/block')
            ->assertOk()->assertJson(['blocked' => false]);
        $this->assertDatabaseMissing('zalo_sender_blocks', ['sender_uid' => 'S1']);

        // Gọi xoá lại lần nữa (idempotent) không lỗi.
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/free-rides/senders/S1/block')
            ->assertOk()->assertJson(['blocked' => false]);
    }

    public function test_disabling_group_and_blocking_sender_hide_rides_for_drivers(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Một', 'enabled' => true]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'name' => 'Nhóm Hai', 'enabled' => true]);
        $this->ride(['sender_uid' => 'A1', 'zalo_group_id' => 'g1']);
        $this->ride(['sender_uid' => 'B1', 'zalo_group_id' => 'g2']);

        $driver = $this->driver();
        $admin = $this->admin();

        $this->assertCount(2, $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'));

        $this->actingAs($admin, 'sanctum')->patchJson('/api/admin/free-rides/groups/g1', ['enabled' => false])->assertOk();
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/B1/block')->assertOk();

        $this->assertCount(0, $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
    }

    public function test_status_reports_heartbeat_and_counts(): void
    {
        $admin = $this->admin();

        $empty = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/status')->assertOk();
        $this->assertSame([], $empty->json('services'));

        app(ZaloServiceMonitor::class)->recordHeartbeat([
            'service_id' => 'zalo-1',
            'uptime_s' => 100,
            'accounts' => [['id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null]],
            'received_total' => 10,
            'stored_total' => 9,
            'duplicates_total' => 1,
            'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
            'outbox_backlog' => 2,
            'ai_spent_today_usd' => 1.5,
            'ai_budget_usd' => 5,
            'held_back_rides' => 0,
            'qr_ok_24h' => 10,
            'qr_empty_24h' => 0,
        ]);

        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'G1', 'enabled' => true]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'name' => 'G2', 'enabled' => false]);
        // Nhóm đã rời: không được tính vào groups_total hay groups_enabled dù enabled=true.
        ZaloGroup::create(['zalo_group_id' => 'g3', 'name' => 'G3 Đã Rời', 'enabled' => true, 'left_at' => now()]);
        $this->ride(['expires_at' => now()->addHour()]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/status')->assertOk();

        $this->assertSame('zalo-1', $res->json('services.0.service_id'));
        $this->assertFalse($res->json('services.0.stale'));
        $this->assertSame(
            [['id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null]],
            $res->json('services.0.accounts')
        );
        $this->assertSame(1.5, $res->json('services.0.ai_spent_today_usd'));
        $this->assertEquals(5, $res->json('services.0.ai_budget_usd'));
        $this->assertSame(1, $res->json('active_rides'));
        $this->assertSame(1, $res->json('groups_enabled'));
        // 2 (g1 + g2), không phải 3 — g3 đã rời nên không được đếm dù vẫn enabled=true.
        $this->assertSame(2, $res->json('groups_total'));
    }

    // Validation accounts.*.logged_in/last_error + Node gửi đủ 2 trường này qua HTTP thật (HMAC ký
    // giống service) — không chỉ gọi thẳng ZaloServiceMonitor::recordHeartbeat() như test trên.
    public function test_heartbeat_http_endpoint_carries_login_state_and_last_error_to_status(): void
    {
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $admin = $this->admin();

        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1',
            'uptime_s' => 100,
            'accounts' => [
                ['id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null],
                ['id' => 'acc2', 'connected' => false, 'logged_in' => false, 'last_error' => 'phiên hết hạn'],
            ],
            'received_total' => 10,
            'stored_total' => 9,
            'duplicates_total' => 1,
            'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
        ])->assertOk();

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/status')->assertOk();

        $this->assertSame(
            [
                ['id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null],
                ['id' => 'acc2', 'connected' => false, 'logged_in' => false, 'last_error' => 'phiên hết hạn'],
            ],
            $res->json('services.0.accounts')
        );
    }

    // Phòng tuyến thứ hai: service Node đã cắt còn 300 ký tự trước khi gửi, nhưng nếu lỡ gửi dài
    // hơn, Laravel phải CẮT chứ không được 422 từ chối cả gói heartbeat (service trông như đã chết).
    public function test_heartbeat_with_long_last_error_is_accepted_and_truncated(): void
    {
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $admin = $this->admin();
        $longError = str_repeat('x', 1000);

        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1',
            'uptime_s' => 100,
            'accounts' => [
                ['id' => 'acc1', 'connected' => false, 'logged_in' => false, 'last_error' => $longError],
            ],
            'received_total' => 10,
            'stored_total' => 9,
            'duplicates_total' => 1,
            'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
        ])->assertOk();

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/status')->assertOk();

        $lastError = $res->json('services.0.accounts.0.last_error');
        $this->assertLessThanOrEqual(500, mb_strlen($lastError));
        $this->assertSame(str_repeat('x', 500), $lastError);
    }

    public function test_overlong_route_params_do_not_500(): void
    {
        $admin = $this->admin();
        $tooLong = str_repeat('a', 40);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/admin/free-rides/groups/{$tooLong}", ['enabled' => false])
            ->assertStatus(404);
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/free-rides/senders/{$tooLong}/block")
            ->assertStatus(404);
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/free-rides/senders/{$tooLong}/block")
            ->assertStatus(404);
    }

    public function test_senders_search_by_either_posted_name_returns_full_counts(): void
    {
        $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Tên Cũ', 'posted_at' => now()->subHour(), 'expires_at' => now()->addHour()]);
        $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Tên Mới', 'posted_at' => now()->subMinutes(30), 'expires_at' => now()->addHours(2)]);
        $this->ride(['sender_uid' => 'A1', 'sender_name' => 'Tên Mới', 'posted_at' => now()->subMinutes(10), 'expires_at' => now()->addHours(3)]);
        $admin = $this->admin();

        foreach (['Tên Cũ', 'Tên Mới'] as $name) {
            $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders?q='.urlencode($name))->assertOk();
            $rows = collect($res->json('data'))->keyBy('sender_uid');
            $this->assertArrayHasKey('A1', $rows->all(), "q=$name phải tìm thấy A1");
            $this->assertSame(3, $rows['A1']['active_rides'], "q=$name không được đếm thiếu active_rides");
            $this->assertSame(3, $rows['A1']['rides_7d'], "q=$name không được đếm thiếu rides_7d");
        }
    }
}
