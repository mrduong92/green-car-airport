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
use Tests\TestCase;

class FreeRideAdminTest extends TestCase
{
    use RefreshDatabase;

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
        $this->assertSame(2, $res->json('groups_total'));
    }
}
