<?php

namespace Tests\Feature;

use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Models\ZaloGroup;
use App\Models\ZaloSenderBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** Cuốc tài xế đăng (posted_by_user_id, qr_code/zalo_group_id null) trong tab Free. */
class DriverRideVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
    }

    private function driver(bool $unlocked = true, string $status = 'active'): User
    {
        $u = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $u->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
            'free_unlocked_until' => $unlocked ? now()->addYear() : null,
        ]);

        return $u;
    }

    private function driverRide(User $poster, array $overrides = []): FreeRide
    {
        static $n = 0;
        $n++;

        return FreeRide::create(array_merge([
            'ride_uid' => "gca-test$n", 'sender_uid' => FreeRide::driverSenderUid($poster->id), 'sender_name' => $poster->name,
            'qr_code' => null, 'zalo_group_id' => null, 'group_name' => '', 'posted_by_user_id' => $poster->id,
            'contact_zalo' => true, 'is_raw' => true, 'is_free' => false, 'raw_text' => "tiễn Mỹ Đình $n",
            'group_count' => 1, 'posted_at' => now()->subMinutes(10 - $n), 'expires_at' => now()->addHours(3), 'parse_status' => 'pending',
        ], $overrides));
    }

    private function zaloRide(array $overrides = []): FreeRide
    {
        return FreeRide::create(array_merge([
            'ride_uid' => 'z-1', 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => 'abc123',
            'zalo_group_id' => 'g1', 'group_name' => 'Nhóm', 'direction' => 'to_airport', 'pickup' => 'A', 'destination' => 'B',
            'is_free' => false, 'is_raw' => false, 'raw_text' => 'tin', 'group_count' => 1, 'posted_at' => now()->subHour(), 'expires_at' => now()->addHour(),
        ], $overrides));
    }

    private function list(User $viewer): array
    {
        return $this->actingAs($viewer, 'sanctum')->getJson('/api/driver/free-rides')->assertOk()->json('data');
    }

    public function test_driver_ride_visible_even_with_blocks_and_disabled_groups_present(): void
    {
        // Có dữ liệu chặn/ẩn/nhóm tắt → các subquery NOT IN không rỗng; cuốc có cột null vẫn phải hiện.
        ZaloSenderBlock::create(['sender_uid' => 'x', 'qr_code' => 'blockedqr']);
        ZaloGroup::create(['zalo_group_id' => 'off', 'name' => 'Tắt', 'enabled' => false]);
        $viewer = $this->driver();
        DriverHiddenSender::create(['driver_id' => $viewer->id, 'qr_code' => 'hiddenqr']);
        $ride = $this->driverRide($this->driver());

        $this->assertSame([$ride->ride_uid], array_column($this->list($viewer), 'ride_uid'));
    }

    public function test_presenter_fields_for_driver_ride(): void
    {
        $poster = $this->driver();
        $this->driverRide($poster);

        $row = $this->list($this->driver())[0];
        $this->assertSame('driver', $row['source']);
        $this->assertFalse($row['is_mine']);
        $this->assertSame(['phone' => $poster->phone, 'zalo' => true], $row['contact']);
        $this->assertSame($poster->name, $row['sender_name']);
        $this->assertNull($row['qr_code']);
        $this->assertNull($row['contact_url']);
        $this->assertNull($row['closed_at']);
    }

    public function test_contact_hidden_when_viewer_locked_and_on_own_ride(): void
    {
        $poster = $this->driver();
        $this->driverRide($poster);

        $this->assertNull($this->list($this->driver(unlocked: false))[0]['contact']);
        $own = $this->list($poster)[0];
        $this->assertTrue($own['is_mine']);
        $this->assertNull($own['contact']);
    }

    public function test_parse_status_only_for_own_ride(): void
    {
        $poster = $this->driver();
        $this->driverRide($poster);

        $this->assertSame('pending', $this->list($poster)[0]['parse_status']);
        $this->assertNull($this->list($this->driver())[0]['parse_status']);
    }

    public function test_contact_zalo_flag(): void
    {
        $this->driverRide($this->driver(), ['contact_zalo' => false]);

        $this->assertFalse($this->list($this->driver())[0]['contact']['zalo']);
    }

    public function test_closed_ride_and_inactive_poster_hidden(): void
    {
        $this->driverRide($this->driver(), ['closed_at' => now()]);
        $this->driverRide($this->driver(status: 'blocked'));

        $this->assertSame([], $this->list($this->driver()));
    }

    public function test_hide_poster_by_sender_uid(): void
    {
        $poster = $this->driver();
        $ride = $this->driverRide($poster);
        $viewer = $this->driver();

        $this->actingAs($viewer, 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => $ride->sender_uid])->assertOk();

        $this->assertSame([], $this->list($viewer));
    }

    public function test_zalo_ride_payload_unchanged_plus_source(): void
    {
        $this->zaloRide();

        $row = $this->list($this->driver())[0];
        $this->assertSame('zalo', $row['source']);
        $this->assertSame('zalo://qr/p/abc123', $row['contact_url']);
        $this->assertNull($row['contact']);
    }
}
