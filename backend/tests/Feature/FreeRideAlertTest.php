<?php

namespace Tests\Feature;

use App\Jobs\NotifyFreeRideAlerts;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverHiddenSender;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Models\ZaloGroup;
use App\Models\ZaloSenderBlock;
use App\Notifications\FreeRideMatchNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class FreeRideAlertTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-11 10:00:00'));
    }

    private function driver(string $status = 'active', bool $withToken = true): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
        ]);

        if ($withToken) {
            DeviceToken::create([
                'user_id' => $driver->id, 'endpoint' => 'https://push.example/'.$driver->id,
                'p256dh' => 'key', 'auth' => 'auth',
            ]);
        }

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

    // ---- lưu / đọc cảnh báo ----

    public function test_default_alert_is_disabled_and_null(): void
    {
        $driver = $this->driver();

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides/alert')->assertOk();

        $this->assertSame([
            'enabled' => false, 'direction' => null, 'seats' => null, 'keywords' => null,
        ], $res->json());
    }

    public function test_save_and_read_alert(): void
    {
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', [
            'enabled' => true, 'direction' => 'to_airport', 'seats' => 4, 'keywords' => 'nội bài',
        ])->assertOk()->assertJson([
            'enabled' => true, 'direction' => 'to_airport', 'seats' => 4, 'keywords' => 'nội bài',
        ]);

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides/alert')->assertOk();
        $this->assertSame([
            'enabled' => true, 'direction' => 'to_airport', 'seats' => 4, 'keywords' => 'nội bài',
        ], $res->json());

        $this->assertDatabaseCount('driver_free_ride_alerts', 1);
    }

    public function test_saving_again_updates_the_single_alert_row(): void
    {
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', ['enabled' => true, 'direction' => 'to_airport'])->assertOk();
        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', ['enabled' => false])->assertOk();

        $this->assertDatabaseCount('driver_free_ride_alerts', 1);
        $this->assertDatabaseHas('driver_free_ride_alerts', ['driver_id' => $driver->id, 'enabled' => false, 'direction' => null]);
    }

    public function test_saving_alert_validates_input(): void
    {
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', ['enabled' => true, 'direction' => 'bay'])->assertStatus(422);
        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', ['enabled' => true, 'keywords' => str_repeat('a', 101)])->assertStatus(422);
        $this->actingAs($driver, 'sanctum')->putJson('/api/driver/free-rides/alert', ['enabled' => true, 'seats' => 0])->assertStatus(422);
    }

    // ---- job: khớp / không khớp ----

    public function test_push_sent_when_ride_matches_direction_seats_and_keywords(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true, 'direction' => 'to_airport', 'seats' => 4, 'keywords' => 'sân bay']);

        $this->ride(['direction' => 'to_airport', 'seats' => 4, 'destination' => 'Sân bay Nội Bài']);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_direction_does_not_match(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true, 'direction' => 'from_airport']);

        $this->ride(['direction' => 'to_airport']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_seats_do_not_match(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true, 'seats' => 7]);

        $this->ride(['seats' => 4]);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_keywords_do_not_match(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true, 'keywords' => 'Đà Nẵng']);

        $this->ride(['pickup' => 'Hà Nội', 'destination' => 'Sân bay', 'raw_text' => 'đi sân bay']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    // ---- loại trừ: không active / không token / ẩn người bắn / nhóm tắt ----

    public function test_no_push_when_alert_is_disabled(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => false]);

        $this->ride();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_driver_is_not_active(): void
    {
        Notification::fake();
        $driver = $this->driver('pending');
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_driver_has_no_device_token(): void
    {
        Notification::fake();
        $driver = $this->driver('active', withToken: false);
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_sender_is_hidden_by_driver(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'sender_uid' => 'A1']);

        $this->ride(['sender_uid' => 'A1']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_sender_is_globally_blocked(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        ZaloSenderBlock::create(['sender_uid' => 'A1']);

        $this->ride(['sender_uid' => 'A1']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_group_is_disabled(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Một', 'enabled' => false]);

        $this->ride(['zalo_group_id' => 'g1']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_for_expired_ride(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride(['expires_at' => now()->subMinute()]);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    // ---- nội dung push: 1 vs nhiều cuốc ----

    public function test_push_content_for_single_matching_ride(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride([
            // 09:30 UTC (app.timezone) = 16:30 giờ VN.
            'pickup' => 'Phố cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => Carbon::parse('2026-10-11 09:30:00', 'UTC'), 'price' => 250000, 'is_free' => false,
        ]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === 'Cuốc Free: Phố cổ → Sân bay Nội Bài · 16:30 · 250.000đ'
                && $payload['data'] === ['action' => 'open_url', 'url' => '/driver/free'];
        });
    }

    public function test_push_content_for_ride_without_pickup_at_shows_di_luon(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride(['pickup' => 'Phố cổ', 'destination' => 'Sân bay', 'pickup_at' => null, 'price' => 150000]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === 'Cuốc Free: Phố cổ → Sân bay · Đi luôn · 150.000đ';
        });
    }

    public function test_push_content_for_multiple_matching_rides(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride();
        $this->ride();
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === '2 cuốc Free mới phù hợp'
                && $payload['data'] === ['action' => 'open_url', 'url' => '/driver/free'];
        });
    }

    // ---- chống làm phiền 2 phút rồi gộp ----

    public function test_throttles_to_one_push_per_two_minutes_then_merges_pending_rides(): void
    {
        Notification::fake();
        $driver = $this->driver();
        $alert = DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentTo($driver, FreeRideMatchNotification::class);
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        // Trong vòng 2 phút kể từ lần push trước: cuốc thứ hai đến nhưng không được push ngay.
        $this->travel(1)->minutes();
        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        // Qua 2 phút kể từ lần push trước: push lần hai gộp cuốc thứ hai (đã dồn) + cuốc thứ ba —
        // KHÔNG gồm lại cuốc đầu tiên đã push riêng ở trên.
        $this->travel(2)->minutes();
        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 2);

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === '2 cuốc Free mới phù hợp';
        });
    }

    // ---- cuốc cập nhật (không mới) không kích hoạt job ----

    public function test_updating_existing_ride_does_not_dispatch_alert_job(): void
    {
        Queue::fake();
        $payload = [
            'ride_uid' => 'r-1', 'sender_uid' => '111', 'sender_name' => '', 'qr_code' => 'QRCODE1',
            'zalo_group_id' => 'g1', 'group_name' => '', 'direction' => null, 'pickup' => null,
            'destination' => null, 'pickup_at' => null, 'pickup_time_text' => null, 'seats' => null,
            'vehicle_note' => null, 'price' => null, 'is_free' => false, 'is_raw' => true, 'raw_text' => 'x',
            'group_count' => 1, 'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHour()->getTimestampMs(),
        ];

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$payload]])->assertOk();
        Queue::assertPushed(NotifyFreeRideAlerts::class, 1);

        // Gửi lại cùng ride_uid (cập nhật, không phải cuốc mới) — không được xếp thêm job cảnh báo.
        $updated = array_merge($payload, ['group_count' => 2]);
        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$updated]])->assertOk();
        Queue::assertPushed(NotifyFreeRideAlerts::class, 1);
    }

    public function test_storing_only_new_rides_dispatches_alert_job(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [[
            'ride_uid' => 'r-2', 'sender_uid' => '111', 'sender_name' => '', 'qr_code' => 'QRCODE2',
            'zalo_group_id' => 'g1', 'group_name' => '', 'direction' => null, 'pickup' => null,
            'destination' => null, 'pickup_at' => null, 'pickup_time_text' => null, 'seats' => null,
            'vehicle_note' => null, 'price' => null, 'is_free' => false, 'is_raw' => true, 'raw_text' => 'x',
            'group_count' => 1, 'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHour()->getTimestampMs(),
        ]]])->assertOk();

        Queue::assertPushed(NotifyFreeRideAlerts::class, 1);
    }

    public function test_no_alert_job_when_nothing_was_stored(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [['ride_uid' => 'bad']]])->assertOk();

        Queue::assertNotPushed(NotifyFreeRideAlerts::class);
    }
}
