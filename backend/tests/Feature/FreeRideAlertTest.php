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
use Illuminate\Support\Facades\DB;
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
        $this->travel(1)->second();

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

    public function test_no_push_when_profile_qr_code_is_blocked_even_for_another_uid(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        // Chặn theo hồ sơ (qr_code); cuốc tới từ một uid khác của cùng người đó.
        ZaloSenderBlock::create(['qr_code' => 'QRX']);

        $this->ride(['sender_uid' => 'U2', 'qr_code' => 'QRX']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_no_push_when_profile_qr_code_is_hidden_by_driver(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'qr_code' => 'QRX']);

        $this->ride(['sender_uid' => 'U2', 'qr_code' => 'QRX']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_push_still_sent_when_unrelated_profiles_are_blocked(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        // Hàng chặn theo qr (sender_uid NULL) và hàng chặn kiểu cũ (qr_code NULL) không được làm
        // NOT IN (… NULL …) loại sạch mọi cuốc.
        ZaloSenderBlock::create(['qr_code' => 'QROTHER']);
        ZaloSenderBlock::create(['sender_uid' => 'OTHER']);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'qr_code' => 'QROTHER2']);
        DriverHiddenSender::create(['driver_id' => $driver->id, 'sender_uid' => 'OTHER2']);
        $this->travel(1)->second();

        $this->ride(['sender_uid' => 'U2', 'qr_code' => 'QRX']);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class);
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
        $this->travel(1)->second();

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

    // Tag riêng để sw.ts không gộp/đè push Cuốc Free lên push cuốc trả khách đang chờ (cùng tag
    // mặc định 'greenca-notification' sẽ khiến push sau thay push trước mà không renotify).
    public function test_push_payload_has_dedicated_tag_so_it_does_not_overwrite_other_pushes(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride(['pickup' => 'Phố cổ', 'destination' => 'Sân bay', 'price' => 150000]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return ($payload['tag'] ?? null) === 'greenca-free-ride';
        });
    }

    public function test_push_content_for_ride_without_pickup_at_shows_di_luon(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        // pickup_time_text=null: nếu không, mục 2 ưu tiên hiện pickup_time_text trước "Đi luôn".
        $this->ride(['pickup' => 'Phố cổ', 'destination' => 'Sân bay', 'pickup_at' => null, 'pickup_time_text' => null, 'price' => 150000]);
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
        $this->travel(1)->second();

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
        // Cuốc dồn trong lúc chặn khiến job tự xếp lại chính nó (mục 5) — fake Queue để lần xếp lại
        // đó không chạy NGAY LẬP TỨC qua driver 'sync' của test (sẽ đệ quy vô hạn vì "now" test không
        // tự trôi): ta tự lái thời gian bằng travel()/handle() thủ công như một job thật sẽ làm.
        Queue::fake();
        $driver = $this->driver();
        $alert = DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

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

    // ---- Fix round 1: giá đúng / "Không chiết khấu" thay vì "Miễn phí" ----

    public function test_push_content_shows_price_and_khong_chiet_khau_when_is_free_flag_set(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride([
            // 09:30 UTC (app.timezone) = 16:30 giờ VN.
            'pickup' => 'Phố cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => Carbon::parse('2026-10-11 09:30:00', 'UTC'), 'price' => 300000, 'is_free' => true,
        ]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === 'Cuốc Free: Phố cổ → Sân bay Nội Bài · 16:30 · 300.000đ · Không chiết khấu'
                && ! str_contains($payload['body'], 'Miễn phí');
        });
    }

    public function test_push_content_omits_price_segment_when_price_is_null(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride([
            'pickup' => 'Phố cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => Carbon::parse('2026-10-11 09:30:00', 'UTC'), 'price' => null, 'is_free' => false,
        ]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return $payload['body'] === 'Cuốc Free: Phố cổ → Sân bay Nội Bài · 16:30';
        });
    }

    // ---- Fix round 1: cuốc nguyên văn (raw) không hiện " →  " rỗng ----

    public function test_push_content_uses_raw_text_snippet_when_pickup_is_empty(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $raw = str_repeat('đi sân bay nội bài chiều nay giá rẻ xe 7 chỗ còn 3 ghế trống liên hệ ngay ạ ', 3);
        $this->ride([
            'pickup' => null, 'destination' => null, 'pickup_at' => null, 'pickup_time_text' => null,
            'raw_text' => $raw, 'price' => null,
        ]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver, $raw) {
            $payload = $n->toWebPush($driver, $n);
            $expectedSnippet = mb_substr(trim($raw), 0, 80).'…';

            return $payload['body'] === "Cuốc Free: {$expectedSnippet} · Đi luôn"
                && ! str_contains($payload['body'], '→');
        });
    }

    public function test_push_content_shows_pickup_time_text_when_pickup_at_is_null(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride([
            'pickup' => null, 'destination' => null, 'pickup_at' => null, 'pickup_time_text' => '4h chiều',
            'raw_text' => 'đi sân bay 4h chiều nay', 'price' => null,
        ]);
        $this->travel(1)->second();

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return str_contains($payload['body'], '· 4h chiều') && ! str_contains($payload['body'], 'Đi luôn');
        });
    }

    // ---- Fix round 1: mốc phải tính tới lúc cảnh báo được bật/đổi ----

    public function test_no_push_for_rides_created_before_alert_was_enabled(): void
    {
        Notification::fake();
        $driver = $this->driver();

        $this->ride();
        $this->travel(1)->second();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);
    }

    public function test_only_rides_created_after_filter_change_are_matched(): void
    {
        Notification::fake();
        $driver = $this->driver();
        $alert = DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride(['direction' => 'to_airport']);
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        // Qua hẳn 2 phút (hết chặn làm phiền) để tách riêng khỏi logic chống làm phiền — chỉ còn
        // muốn kiểm tra riêng việc đổi bộ lọc.
        $this->travel(3)->minutes();

        // Cuốc tạo SAU lần push đầu nhưng TRƯỚC khi đổi bộ lọc — dù khớp bộ lọc MỚI vẫn không được tính.
        $oldRide = $this->ride(['direction' => 'from_airport']);

        $this->travel(1)->second();
        $alert->update(['direction' => 'from_airport']);

        $this->travel(1)->second();
        $newRide = $this->ride(['direction' => 'from_airport']);

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 2);
        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver, $newRide, $oldRide) {
            $payload = $n->toWebPush($driver, $n);

            return str_contains($payload['body'], $newRide->pickup) && ! str_contains($payload['body'], $oldRide->pickup);
        });
    }

    public function test_cached_previous_run_mark_is_used_as_floor_when_newer_than_alert_update(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);

        $this->travel(1)->second();
        $this->ride(); // tạo ngay sau khi bật cảnh báo — nhưng sẽ bị loại vì mốc cache sau này mới hơn.

        // Mô phỏng job đã chạy một lần (vd. vì cảnh báo của tài xế khác) và lưu mốc cache MỚI hơn cả
        // thời điểm bật cảnh báo lẫn thời điểm tạo cuốc ở trên.
        $this->travel(10)->minutes();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertNotSentTo($driver, FreeRideMatchNotification::class);

        $this->travel(1)->second();
        $r2 = $this->ride(); // tạo SAU mốc cache vừa lưu — phải khớp.

        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver, $r2) {
            $payload = $n->toWebPush($driver, $n);

            return str_contains($payload['body'], $r2->pickup);
        });
    }

    // ---- Fix round 1: cửa sổ theo id (mốc cao nhất chốt lúc job bắt đầu) ----

    public function test_rides_inserted_after_the_jobs_id_high_water_mark_wait_for_the_next_run(): void
    {
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride();
        $this->travel(1)->second();

        $midRunRide = null;
        $listenerFired = false;
        DB::listen(function ($query) use (&$midRunRide, &$listenerFired) {
            if (! $listenerFired && str_contains(strtolower($query->sql), 'max(')) {
                $listenerFired = true;
                // Mô phỏng cuốc service ghi vào ĐÚNG lúc job đang xử lý (chèn ngay sau khi job đã
                // chốt mốc id cao nhất — xử lý tốn chút thời gian thực, travel() mô phỏng đúng việc
                // đó) — không được tính vào lần chạy này dù created_at đã mới hơn last_pushed_at.
                $this->travel(1)->second();
                $midRunRide = FreeRide::create([
                    'ride_uid' => 'mid-run', 'sender_uid' => 'A1', 'qr_code' => 'midrun', 'zalo_group_id' => 'g1',
                    'pickup' => 'Giữa Chừng', 'destination' => 'Sân bay', 'raw_text' => 'mid run ride',
                    'posted_at' => now(), 'expires_at' => now()->addHours(2),
                ]);
            }
        });

        (new NotifyFreeRideAlerts)->handle();

        $this->assertNotNull($midRunRide, 'listener chèn cuốc giữa chừng phải chạy');
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);
        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return ! str_contains($payload['body'], 'Giữa Chừng');
        });

        // Qua hẳn 2 phút (hết chặn làm phiền) rồi chạy lại — cuốc chèn giữa chừng ở trên giờ mới được tính.
        $this->travel(3)->minutes();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 2);
        Notification::assertSentTo($driver, FreeRideMatchNotification::class, function (FreeRideMatchNotification $n) use ($driver) {
            $payload = $n->toWebPush($driver, $n);

            return str_contains($payload['body'], 'Giữa Chừng');
        });
    }

    // Job tự ghi last_pushed_at KHÔNG được đụng tới updated_at — nếu không, mốc "cuốc bị chặn id ở
    // CHÍNH lần chạy vừa push thành công" sẽ bị chính updated_at mới đó chặn vĩnh viễn ở mọi lần sau.
    public function test_job_recording_last_pushed_at_does_not_bump_updated_at(): void
    {
        Notification::fake();
        $driver = $this->driver();
        $alert = DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $originalUpdatedAt = $alert->updated_at;
        $this->travel(1)->second();

        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        $alert->refresh();
        $this->assertNotNull($alert->last_pushed_at);
        $this->assertTrue($alert->updated_at->eq($originalUpdatedAt), 'updated_at không được đổi khi job tự ghi last_pushed_at');
    }

    // ---- Fix round 1 (minor): xếp lại job khi cảnh báo bị chặn còn cuốc chờ gộp ----

    public function test_requeues_job_when_gated_alert_still_has_pending_rides(): void
    {
        Queue::fake();
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        // Trong 2 phút: cuốc mới tới nhưng bị chặn — phải tự xếp lại job đúng lúc hết chặn.
        $this->travel(10)->seconds();
        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();

        Queue::assertPushed(NotifyFreeRideAlerts::class, 1);
    }

    public function test_does_not_requeue_when_nothing_is_gated(): void
    {
        Queue::fake();
        Notification::fake();
        $driver = $this->driver();
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->ride();
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();

        Queue::assertNotPushed(NotifyFreeRideAlerts::class);
    }
}
