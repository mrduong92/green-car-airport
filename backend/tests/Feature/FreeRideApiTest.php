<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FreeRideApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-07 01:00:00')); // 08:00 giờ VN
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
            'ride_uid' => "r-$n", 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => '758z6tl22yft',
            'zalo_group_id' => 'g1', 'group_name' => 'Taxi Nội Bài', 'direction' => 'to_airport',
            'pickup' => "điểm $n", 'destination' => 'Sân bay Nội Bài', 'pickup_at' => now()->addHour(),
            'pickup_time_text' => '9h', 'seats' => 5, 'price' => 200000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => "tiễn 9h điểm $n", 'group_count' => 1, 'posted_at' => now()->subMinutes(100 - $n),
            'expires_at' => now()->addHours(2),
        ], $overrides));
    }

    public function test_lists_active_rides_newest_first_with_contact_url(): void
    {
        $this->ride(['pickup' => 'cũ']);
        $this->ride(['pickup' => 'mới']);
        $this->ride(['pickup' => 'hết hạn', 'expires_at' => now()->subMinute()]);

        $res = $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->assertOk();

        $this->assertSame(['mới', 'cũ'], array_column($res->json('data'), 'pickup'));
        $this->assertSame('zalo://qr/p/758z6tl22yft', $res->json('data.0.contact_url'));
        $this->assertNotNull($res->json('latest'));
    }

    public function test_filters_by_direction_seats_window_and_search(): void
    {
        $this->ride(['pickup' => 'A', 'direction' => 'to_airport', 'seats' => 5]);
        $this->ride(['pickup' => 'B', 'direction' => 'from_airport', 'seats' => 7]);
        $this->ride(['pickup' => 'C Hà Đông', 'direction' => 'other', 'seats' => 5, 'pickup_at' => now()->addHours(30), 'expires_at' => now()->addHours(31)]);
        $driver = $this->driver();
        $pickups = fn (string $qs) => array_column($this->actingAs($driver, 'sanctum')->getJson("/api/driver/free-rides?$qs")->json('data'), 'pickup');

        $this->assertSame(['B'], $pickups('direction=from_airport'));
        $this->assertSame(['C Hà Đông', 'A'], $pickups('seats=5'));
        $this->assertSame(['C Hà Đông'], $pickups('window=tomorrow'));
        $this->assertSame(['B', 'A'], $pickups('window=2h'));
        // SQLite (test) chỉ không phân biệt hoa thường với chữ ASCII; MySQL production (utf8mb4_unicode_ci) còn bỏ qua dấu.
        $this->assertSame(['C Hà Đông'], $pickups('q='.urlencode('Hà Đông')));
    }

    public function test_since_returns_rides_changed_after_the_mark(): void
    {
        $this->ride(['pickup' => 'trước']);
        $this->travel(1)->seconds(); // updated_at chỉ chính xác tới giây
        $mark = now()->getTimestampMs();
        $this->travel(5)->seconds();
        $this->ride(['pickup' => 'sau']);

        $res = $this->actingAs($this->driver(), 'sanctum')->getJson("/api/driver/free-rides?since=$mark")->assertOk();

        $this->assertSame(['sau'], array_column($res->json('data'), 'pickup'));
        $this->assertNull($res->json('next_cursor'));
    }

    public function test_cursor_pagination(): void
    {
        foreach (range(1, 35) as $i) {
            $this->ride();
        }
        $driver = $this->driver();

        $first = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
        $this->assertCount(30, $first->json('data'));
        $second = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides?cursor='.$first->json('next_cursor'))->assertOk();
        $this->assertCount(5, $second->json('data'));
    }

    public function test_hidden_and_blocked_senders_are_excluded(): void
    {
        $this->ride(['sender_uid' => 'hidden', 'pickup' => 'ẩn']);
        $this->ride(['sender_uid' => 'spam', 'pickup' => 'chặn']);
        $this->ride(['sender_uid' => 'ok', 'pickup' => 'hiện']);
        ZaloSenderBlock::create(['sender_uid' => 'spam']);
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => 'hidden'])->assertOk();

        $this->assertSame(['hiện'], array_column($this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'), 'pickup'));
        // Tài xế khác vẫn thấy cuốc của người bắn mà tài xế này ẩn
        $this->assertCount(2, $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
    }

    public function test_rides_with_unsafe_codes_are_not_listed(): void
    {
        $this->ride(['qr_code' => '758z6tl22yft', 'pickup' => 'mã an toàn']);
        $this->ride(['qr_code' => 'abc/../x', 'pickup' => 'mã bẩn']);

        $data = collect($this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'))->keyBy('pickup');

        $this->assertSame('zalo://qr/p/758z6tl22yft', $data['mã an toàn']['contact_url']);
        $this->assertArrayNotHasKey('mã bẩn', $data->all());
    }

    public function test_rides_of_disabled_groups_are_hidden(): void
    {
        $this->ride(['zalo_group_id' => 'g-on', 'pickup' => 'nhóm bật']);
        $this->ride(['zalo_group_id' => 'g-off', 'pickup' => 'nhóm tắt']);
        ZaloGroup::create(['zalo_group_id' => 'g-off', 'name' => 'Nhóm bị tắt', 'enabled' => false]);

        $pickups = array_column($this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'), 'pickup');

        $this->assertSame(['nhóm bật'], $pickups);
    }

    public function test_report_and_broken_link(): void
    {
        $ride = $this->ride();
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/report", ['reason' => 'spam'])->assertOk();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/report", ['reason' => 'wrong_info'])->assertOk();
        $this->assertDatabaseCount('free_ride_reports', 1);
        $this->assertDatabaseHas('free_ride_reports', ['free_ride_uid' => $ride->ride_uid, 'reason' => 'wrong_info']);

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/broken-link")->assertOk();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/broken-link")->assertOk();
        $this->assertSame(1, ZaloQrRefreshRequest::where('sender_uid', '111')->whereNull('delivered_at')->count());

        $this->actingAs($driver, 'sanctum')->postJson('/api/driver/free-rides/khong-co/report', ['reason' => 'spam'])->assertNotFound();
    }

    public function test_inactive_driver_is_forbidden(): void
    {
        $this->actingAs($this->driver('pending'), 'sanctum')->getJson('/api/driver/free-rides')->assertForbidden();
        $this->actingAs($this->driver('blocked'), 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => 'x'])->assertForbidden();
        $this->actingAs(User::factory()->create(['role' => 'customer']), 'sanctum')->getJson('/api/driver/free-rides')->assertForbidden();
    }
}
