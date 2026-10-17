<?php

namespace Tests\Feature;

use App\Jobs\NotifyFreeRideAlerts;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Notifications\FreeRideMatchNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class DriverRideAlertTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
        Notification::fake();
    }

    private function driverWithAlert(): User
    {
        $u = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $u->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        DeviceToken::create(['user_id' => $u->id, 'endpoint' => 'https://push.example/'.$u->id, 'p256dh' => 'k', 'auth' => 'a']);
        DriverFreeRideAlert::create(['driver_id' => $u->id, 'enabled' => true, 'direction' => 'to_airport', 'seats' => null]);
        $this->travel(1)->second(); // mốc lúc bật cảnh báo < id cuốc sau

        return $u;
    }

    private function ride(User $poster, array $o = []): FreeRide
    {
        static $n = 0;
        $n++;

        return FreeRide::create(array_merge([
            'ride_uid' => "gca-a$n", 'sender_uid' => FreeRide::driverSenderUid($poster->id), 'sender_name' => 'P', 'group_name' => '',
            'posted_by_user_id' => $poster->id, 'is_raw' => true, 'is_free' => false, 'raw_text' => 'tiễn', 'group_count' => 1,
            'posted_at' => now(), 'expires_at' => now()->addHours(3), 'parse_status' => 'pending',
        ], $o));
    }

    public function test_pending_ride_holds_floor_then_pushed_after_parse(): void
    {
        $alertDriver = $this->driverWithAlert();
        $poster = $this->driverWithAlert();
        $ride = $this->ride($poster);

        (new NotifyFreeRideAlerts)->handle();
        Notification::assertNothingSent();

        $ride->update(['parse_status' => 'done', 'direction' => 'to_airport']);
        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($alertDriver, FreeRideMatchNotification::class);
    }

    public function test_never_pushes_own_ride(): void
    {
        $poster = $this->driverWithAlert();
        $this->ride($poster, ['parse_status' => 'done', 'direction' => 'to_airport']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($poster, FreeRideMatchNotification::class);
    }

    public function test_stale_pending_does_not_block_later_rides(): void
    {
        $alertDriver = $this->driverWithAlert();
        $poster = $this->driverWithAlert();
        $this->ride($poster); // pending mãi
        $this->travel(NotifyFreeRideAlerts::PENDING_HOLD_MINUTES + 1)->minutes();
        $this->ride($poster, ['parse_status' => 'done', 'direction' => 'to_airport']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($alertDriver, FreeRideMatchNotification::class);
    }

    public function test_closed_pending_ride_does_not_hold_floor(): void
    {
        // Đăng rồi xoá ngay (job tách bỏ qua cuốc đã đóng → mãi pending): cuốc sau vẫn phải được push.
        $alertDriver = $this->driverWithAlert();
        $poster = $this->driverWithAlert();
        $this->ride($poster, ['closed_at' => now()]);
        $this->ride($poster, ['parse_status' => 'done', 'direction' => 'to_airport']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($alertDriver, FreeRideMatchNotification::class);
    }
}
