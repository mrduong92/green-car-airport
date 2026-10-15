<?php

namespace Tests\Feature;

use App\Jobs\NotifyFreeRideAlerts;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** ZALO_FREE_RIDES_ENABLED=false: tắt tab Free phía tài xế (ẩn tab, chặn API, không push). */
class FreeRidesDisabledTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-11 10:00:00'));
    }

    private function driver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'free_unlocked_until' => now()->addYear(),
        ]);
        DeviceToken::create([
            'user_id' => $driver->id, 'endpoint' => 'https://push.example/'.$driver->id,
            'p256dh' => 'key', 'auth' => 'auth',
        ]);

        return $driver;
    }

    private function ride(): FreeRide
    {
        return FreeRide::create([
            'ride_uid' => 'off-1', 'sender_uid' => 'A1', 'sender_name' => 'Người A', 'qr_code' => 'code1',
            'zalo_group_id' => 'g1', 'group_name' => 'Nhóm Một', 'direction' => 'to_airport',
            'pickup' => 'điểm 1', 'destination' => 'Sân bay', 'pickup_at' => now()->addHour(),
            'pickup_time_text' => '9h', 'seats' => 4, 'price' => 100000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => 'raw 1', 'group_count' => 1, 'posted_at' => now(), 'expires_at' => now()->addHours(2),
        ]);
    }

    public static function driverEndpoints(): array
    {
        return [
            'danh sách' => ['get', '/api/driver/free-rides'],
            'đọc cảnh báo' => ['get', '/api/driver/free-rides/alert'],
            'lưu cảnh báo' => ['put', '/api/driver/free-rides/alert'],
            'ẩn người đăng' => ['post', '/api/driver/free-rides/hidden-senders'],
            'báo cáo' => ['post', '/api/driver/free-rides/off-1/report'],
            'link hỏng' => ['post', '/api/driver/free-rides/off-1/broken-link'],
        ];
    }

    #[DataProvider('driverEndpoints')]
    public function test_driver_free_ride_endpoints_return_404_when_disabled(string $method, string $uri): void
    {
        config(['zalo.free_rides_enabled' => false]);
        $this->ride();

        $this->actingAs($this->driver(), 'sanctum')->json($method, $uri)->assertNotFound();
    }

    public function test_list_still_works_when_enabled(): void
    {
        config(['zalo.free_rides_enabled' => true]);
        $this->ride();

        $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
    }

    public function test_me_payload_carries_flag_for_driver(): void
    {
        $driver = $this->driver();

        config(['zalo.free_rides_enabled' => false]);
        $this->actingAs($driver, 'sanctum')->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('free_rides_enabled', false);

        config(['zalo.free_rides_enabled' => true]);
        $this->actingAs($driver, 'sanctum')->getJson('/api/auth/me')
            ->assertOk()->assertJsonPath('free_rides_enabled', true);
    }

    public function test_no_push_when_disabled(): void
    {
        config(['zalo.free_rides_enabled' => false]);
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true, 'direction' => 'to_airport', 'seats' => 4]);
        $this->travel(1)->second();
        $this->ride();
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNothingSent();
    }
}
