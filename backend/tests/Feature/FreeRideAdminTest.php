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

        // Mã QR mặc định theo sender_uid: mỗi uid là một hồ sơ riêng, trừ khi test truyền qr_code
        // dùng chung để mô phỏng một người có nhiều uid (mỗi nick phụ thấy một uid khác).
        return FreeRide::create(array_merge([
            'ride_uid' => "s-$n", 'sender_uid' => 'A1', 'sender_name' => 'Người A', 'qr_code' => 'QR'.($overrides['sender_uid'] ?? 'A1'),
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

    public function test_groups_list_includes_ride_counts_filters_no_rides_7d_and_sorts(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Sôi Động', 'enabled' => true, 'messages_24h' => 10]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'name' => 'Nhóm Im Lìm', 'enabled' => true, 'messages_24h' => 90]);
        ZaloGroup::create(['zalo_group_id' => 'g3', 'name' => 'Nhóm Tắt Không Cuốc', 'enabled' => false, 'messages_24h' => 5]);

        // g1: 2 cuốc trong 24h (cũng tính vào 7 ngày) + 1 cuốc cũ hơn 24h nhưng còn trong 7 ngày.
        $this->ride(['zalo_group_id' => 'g1', 'posted_at' => now()->subHours(2)]);
        $this->ride(['zalo_group_id' => 'g1', 'posted_at' => now()->subHours(10)]);
        $this->ride(['zalo_group_id' => 'g1', 'posted_at' => now()->subDays(3)]);
        // g2: không có cuốc nào trong 7 ngày gần đây (chỉ có 1 cuốc đã quá 7 ngày).
        $this->ride(['zalo_group_id' => 'g2', 'posted_at' => now()->subDays(10)]);
        // g3: tắt, không có cuốc nào — không được lọt vào status=no_rides_7d (đã tắt).

        $admin = $this->admin();

        $default = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups')->assertOk();
        $rows = collect($default->json('data'))->keyBy('zalo_group_id');
        $this->assertSame(2, $rows['g1']['rides_24h']);
        $this->assertSame(3, $rows['g1']['rides_7d']);
        $this->assertSame(0, $rows['g2']['rides_24h']);
        $this->assertSame(0, $rows['g2']['rides_7d']);

        $noRides7d = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups?status=no_rides_7d')->assertOk();
        $this->assertSame(['g2'], array_column($noRides7d->json('data'), 'zalo_group_id'));

        // Mặc định (không lọc status) gồm cả nhóm đã tắt (g3) — vẫn còn hiển thị, chỉ "chưa rời".
        $sorted = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups?sort=rides_7d')->assertOk();
        $this->assertSame(['g1', 'g2', 'g3'], array_column($sorted->json('data'), 'zalo_group_id'));
    }

    // Fix round 1 (mục 7): rideStats giới hạn quét posted_at >= 7 ngày để đỡ tải MySQL — không được
    // đổi kết quả: nhóm chỉ có cuốc rất cũ vẫn phải ra rides_24h=rides_7d=0, không lỗi, không thiếu dòng.
    public function test_groups_ride_counts_ignore_rides_older_than_seven_days(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Chỉ Có Cuốc Cũ', 'enabled' => true]);
        $this->ride(['zalo_group_id' => 'g1', 'posted_at' => now()->subDays(30)]);

        $admin = $this->admin();
        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/groups')->assertOk();
        $row = collect($res->json('data'))->firstWhere('zalo_group_id', 'g1');

        $this->assertSame(0, $row['rides_24h']);
        $this->assertSame(0, $row['rides_7d']);
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
        // Chặn kiểu cũ theo uid, không còn cuốc nào → không suy ra được hồ sơ (qr_code null).
        $this->assertNull($blockedOnly->json('data.0.qr_code'));
        $this->assertNull($blockedOnly->json('data.0.contact_url'));
        $this->assertSame(['B1'], $blockedOnly->json('data.0.sender_uids'));
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
            [[
                'id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null,
                'zalo_uid' => null, 'zalo_name' => null, 'logged_in_at' => null, 'groups' => null,
            ]],
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
                [
                    'id' => 'acc1', 'connected' => true, 'logged_in' => true, 'last_error' => null,
                    'zalo_uid' => null, 'zalo_name' => null, 'logged_in_at' => null, 'groups' => null,
                ],
                [
                    'id' => 'acc2', 'connected' => false, 'logged_in' => false, 'last_error' => 'phiên hết hạn',
                    'zalo_uid' => null, 'zalo_name' => null, 'logged_in_at' => null, 'groups' => null,
                ],
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

    // ---- Gộp người bắn theo hồ sơ (qr_code) ----

    // Hai uid khác nhau (do hai nick phụ thấy) cùng một mã QR → một hàng duy nhất, cộng dồn số liệu.
    private function seedTwoUidProfile(): void
    {
        $r1 = $this->ride(['sender_uid' => 'U1', 'qr_code' => 'QRX', 'sender_name' => 'Tên Cũ', 'group_name' => 'Nhóm A',
            'zalo_group_id' => 'ga', 'posted_at' => now()->subHours(2), 'expires_at' => now()->addHour()]);
        $r2 = $this->ride(['sender_uid' => 'U2', 'qr_code' => 'QRX', 'sender_name' => 'Tên Mới', 'group_name' => 'Nhóm B',
            'zalo_group_id' => 'gb', 'posted_at' => now()->subHour(), 'expires_at' => now()->addHours(2)]);
        $this->ride(['sender_uid' => 'U2', 'qr_code' => 'QRX', 'sender_name' => 'Tên Mới', 'group_name' => 'Nhóm A',
            'zalo_group_id' => 'ga', 'posted_at' => now()->subDays(3), 'expires_at' => now()->subDays(2)]);
        $this->ride(['sender_uid' => 'Z9', 'qr_code' => 'QRZ', 'sender_name' => 'Người Khác', 'group_name' => 'Nhóm C']);

        $driver = $this->driver();
        FreeRideReport::create(['free_ride_uid' => $r1->ride_uid, 'sender_uid' => 'U1', 'driver_id' => $driver->id, 'reason' => 'spam']);
        FreeRideReport::create(['free_ride_uid' => $r2->ride_uid, 'sender_uid' => 'U2', 'driver_id' => $driver->id, 'reason' => 'spam']);
    }

    public function test_senders_are_grouped_by_qr_code_across_uids(): void
    {
        $this->seedTwoUidProfile();

        $res = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/free-rides/senders')->assertOk();

        $this->assertSame(2, $res->json('meta.total'));
        $rows = collect($res->json('data'))->keyBy('qr_code');
        $x = $rows['QRX'];
        $this->assertSame('Tên Mới', $x['sender_name']);
        $this->assertSame('zalo://qr/p/QRX', $x['contact_url']);
        $this->assertSame(['U1', 'U2'], $x['sender_uids']);
        $this->assertSame(['Nhóm B', 'Nhóm A'], $x['groups']);
        $this->assertSame(2, $x['groups_count']);
        $this->assertSame(2, $x['active_rides']);
        $this->assertSame(3, $x['rides_7d']);
        $this->assertSame(2, $x['reports']);
        $this->assertFalse($x['blocked']);
        $this->assertSame(['Nhóm C'], $rows['QRZ']['groups']);
    }

    public function test_senders_search_matches_name_group_uid_and_qr(): void
    {
        $this->seedTwoUidProfile();
        $admin = $this->admin();

        foreach (['Tên Cũ', 'Nhóm B', 'U1', 'QRX'] as $q) {
            $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders?q='.urlencode($q))->assertOk();
            $this->assertSame(['QRX'], array_column($res->json('data'), 'qr_code'), "q=$q");
            $this->assertSame(3, $res->json('data.0.rides_7d'), "q=$q không được đếm thiếu");
        }
    }

    public function test_block_by_qr_code_hides_every_uid_of_the_profile(): void
    {
        $this->seedTwoUidProfile();
        $admin = $this->admin();
        $driver = $this->driver();

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/qr/QRX/block', ['reason' => 'spam'])
            ->assertOk()->assertJson(['blocked' => true]);
        $this->assertDatabaseHas('zalo_sender_blocks', ['qr_code' => 'QRX', 'reason' => 'spam', 'blocked_by' => $admin->id]);
        // Idempotent.
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/qr/QRX/block')->assertOk();
        $this->assertDatabaseCount('zalo_sender_blocks', 1);

        $visible = array_column($this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'), 'sender_uid');
        $this->assertSame(['Z9'], $visible);

        $rows = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->json('data'))->keyBy('qr_code');
        $this->assertTrue($rows['QRX']['blocked']);
        $this->assertFalse($rows['QRZ']['blocked']);

        $blocked = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders?blocked=1')->assertOk();
        $this->assertSame(['QRX'], array_column($blocked->json('data'), 'qr_code'));
        $this->assertSame(['U1', 'U2'], $blocked->json('data.0.sender_uids'));
        $this->assertSame(2, $blocked->json('data.0.reports'));

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/free-rides/senders/qr/QRX/block')
            ->assertOk()->assertJson(['blocked' => false]);
        $this->assertDatabaseCount('zalo_sender_blocks', 0);
        $this->assertCount(3, $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
    }

    public function test_unblock_by_qr_code_also_clears_legacy_uid_blocks_of_the_profile(): void
    {
        $this->seedTwoUidProfile();
        ZaloSenderBlock::create(['sender_uid' => 'U1']);
        $admin = $this->admin();

        $rows = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->json('data'))->keyBy('qr_code');
        $this->assertTrue($rows['QRX']['blocked'], 'chặn kiểu cũ theo uid vẫn tính là hồ sơ bị chặn');

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/free-rides/senders/qr/QRX/block')->assertOk();
        $this->assertDatabaseCount('zalo_sender_blocks', 0);
    }

    public function test_legacy_uid_endpoint_blocks_the_whole_profile_when_rides_exist(): void
    {
        $this->seedTwoUidProfile();
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/U1/block')->assertOk();
        $this->assertDatabaseHas('zalo_sender_blocks', ['qr_code' => 'QRX']);
        $visible = array_column($this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'), 'sender_uid');
        $this->assertSame(['Z9'], $visible);

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/admin/free-rides/senders/U2/block')->assertOk();
        $this->assertDatabaseCount('zalo_sender_blocks', 0);
    }

    public function test_qr_block_route_rejects_bad_codes(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/qr/'.str_repeat('a', 33).'/block')->assertNotFound();
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/free-rides/senders/qr/ab-c/block')->assertNotFound();
    }

    public function test_senders_pagination_counts_profiles_not_uids(): void
    {
        for ($i = 1; $i <= 51; $i++) {
            // Mỗi hồ sơ có 2 uid — phân trang phải đếm 51 hồ sơ, không phải 102 uid.
            $this->ride(['sender_uid' => "a$i", 'qr_code' => sprintf('Q%03d', $i)]);
            $this->ride(['sender_uid' => "b$i", 'qr_code' => sprintf('Q%03d', $i)]);
        }
        $admin = $this->admin();

        $p1 = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->assertOk();
        $this->assertSame(51, $p1->json('meta.total'));
        $this->assertSame(2, $p1->json('meta.last_page'));
        $p2 = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders?page=2')->assertOk();
        $codes = array_merge(array_column($p1->json('data'), 'qr_code'), array_column($p2->json('data'), 'qr_code'));
        $this->assertCount(51, array_unique($codes));
        $this->assertSame('Q001', $codes[0], 'cùng số liệu thì xếp theo qr_code để thứ tự ổn định');
    }
}
