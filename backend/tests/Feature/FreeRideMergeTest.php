<?php

namespace Tests\Feature;

use App\Jobs\NotifyFreeRideAlerts;
use App\Models\DeviceToken;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Models\ZaloGroup;
use App\Notifications\FreeRideMatchNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

/**
 * Gộp cuốc trùng của CÙNG một người (cùng qr_code) đăng ở nhiều nhóm do nhiều nick phụ nghe được
 * (mỗi nick thấy một sender_uid khác) — tab Free, nhánh since, cảnh báo đẩy và đếm admin chỉ thấy
 * một cuốc, group_count hiển thị cộng dồn.
 */
class FreeRideMergeTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-10 03:00:00'));
    }

    private function driver(bool $withToken = false): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        if ($withToken) {
            DeviceToken::create(['user_id' => $driver->id, 'endpoint' => 'https://push.example/'.$driver->id, 'p256dh' => 'k', 'auth' => 'a']);
        }

        return $driver;
    }

    private function ride(array $overrides = []): array
    {
        return array_merge([
            'ride_uid' => 'r-1', 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => 'QRDUC',
            'zalo_group_id' => 'g1', 'group_name' => 'Nhóm Một', 'direction' => 'to_airport',
            'pickup' => 'Phố Cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => now()->addHour()->getTimestampMs(), 'pickup_time_text' => '11h',
            'seats' => 4, 'vehicle_note' => null, 'price' => 200000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => 'tiễn 11h phố cổ đi sân bay 200k', 'group_count' => 1,
            'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHours(2)->getTimestampMs(),
        ], $overrides);
    }

    // Cùng người, nick khác thấy uid khác, nhóm khác, đăng sau 1 phút.
    private function twin(array $overrides = []): array
    {
        return $this->ride(array_merge([
            'ride_uid' => 'r-2', 'sender_uid' => '222', 'zalo_group_id' => 'g2', 'group_name' => 'Nhóm Hai',
            'posted_at' => now()->addMinute()->getTimestampMs(), 'expires_at' => now()->addHours(2)->addMinute()->getTimestampMs(),
        ], $overrides));
    }

    private function send(array $rides): void
    {
        $this->zaloPost('/api/internal/zalo/rides', ['rides' => $rides])->assertOk()->assertJson(['rejected' => []]);
    }

    private function visible(?User $driver = null, string $qs = ''): array
    {
        return $this->actingAs($driver ?? $this->driver(), 'sanctum')
            ->getJson('/api/driver/free-rides'.($qs !== '' ? "?$qs" : ''))->assertOk()->json('data');
    }

    // ---- gộp ----

    public function test_same_profile_two_uids_same_content_shows_one_ride_with_summed_group_count(): void
    {
        Queue::fake();
        $this->send([$this->ride(['group_count' => 2])]);
        // Chữ khác hoa thường/khoảng trắng, giờ đón lệch 10 phút (vẫn trong cửa sổ 30 phút).
        $this->send([$this->twin([
            'pickup' => '  phố   cổ ', 'destination' => 'SÂN BAY nội bài', 'group_count' => 3,
            'pickup_at' => now()->addMinutes(70)->getTimestampMs(),
        ])]);

        $this->assertSame(2, FreeRide::count());
        $this->assertSame(FreeRide::where('ride_uid', 'r-1')->value('id'), FreeRide::where('ride_uid', 'r-2')->value('duplicate_of_id'));
        $this->assertNull(FreeRide::where('ride_uid', 'r-1')->value('duplicate_of_id'));

        $data = $this->visible();
        $this->assertCount(1, $data);
        $this->assertSame('r-1', $data[0]['ride_uid']);
        $this->assertSame(5, $data[0]['group_count']);
    }

    public function test_rides_in_the_same_batch_are_merged_keeping_the_earliest_posted(): void
    {
        Queue::fake();
        // Gửi bản sau trước trong lô — cuốc gốc vẫn là cuốc đăng sớm nhất.
        $this->send([$this->twin(), $this->ride()]);

        $data = $this->visible();
        $this->assertCount(1, $data);
        $this->assertSame('r-1', $data[0]['ride_uid']);
        $this->assertSame(2, $data[0]['group_count']);
    }

    public function test_bumping_duplicate_group_count_is_reflected_and_reaches_since_clients(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        $this->send([$this->twin()]);
        $this->travel(1)->second();
        $mark = now()->getTimestampMs();
        $this->travel(5)->seconds();

        // Service gửi lại bản trùng với group_count tăng (người đó đăng thêm nhóm).
        $this->send([$this->twin(['group_count' => 4])]);

        $driver = $this->driver();
        $this->assertSame(5, $this->visible($driver)[0]['group_count']);

        $since = $this->visible($driver, "since=$mark");
        $this->assertSame(['r-1'], array_column($since, 'ride_uid'));
        $this->assertSame(5, $since[0]['group_count']);
    }

    public function test_since_path_excludes_duplicates(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        $this->travel(1)->second();
        $mark = now()->getTimestampMs();
        $this->travel(5)->seconds();

        $this->send([$this->twin()]);

        $since = $this->visible(null, "since=$mark");
        // Bản trùng không lọt ra; cuốc gốc được "chạm" để client cập nhật group_count.
        $this->assertSame(['r-1'], array_column($since, 'ride_uid'));
        $this->assertSame(2, $since[0]['group_count']);
    }

    // ---- không gộp ----

    public function test_different_profiles_with_identical_content_are_not_merged(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        $this->send([$this->twin(['qr_code' => 'QRKHAC'])]);

        $this->assertSame(['r-2', 'r-1'], array_column($this->visible(), 'ride_uid'));
        $this->assertSame(0, FreeRide::whereNotNull('duplicate_of_id')->count());
    }

    public function test_same_profile_different_content_is_not_merged(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        // Giờ đón lệch 45 phút → khác cửa sổ 30 phút.
        $this->send([$this->twin(['ride_uid' => 'r-2', 'pickup_at' => now()->addMinutes(105)->getTimestampMs()])]);
        // Điểm đón khác.
        $this->send([$this->twin(['ride_uid' => 'r-3', 'pickup' => 'Hà Đông'])]);
        // Chiều khác.
        $this->send([$this->twin(['ride_uid' => 'r-4', 'direction' => 'from_airport'])]);
        // Một bản có giờ đón, một bản không.
        $this->send([$this->twin(['ride_uid' => 'r-5', 'pickup_at' => null])]);

        $this->assertCount(5, $this->visible());
        $this->assertSame(0, FreeRide::whereNotNull('duplicate_of_id')->count());
    }

    public function test_same_profile_different_seats_is_not_merged(): void
    {
        Queue::fake();
        $this->send([$this->ride(['seats' => 4])]);
        $this->send([$this->twin(['ride_uid' => 'r-2', 'seats' => 7])]);
        // Một bản có số chỗ, một bản không → cũng không gộp (lọc theo số chỗ không được làm mất cuốc).
        $this->send([$this->twin(['ride_uid' => 'r-3', 'seats' => null])]);

        $this->assertCount(3, $this->visible());
        $this->assertCount(1, $this->visible(null, 'seats=7'));
    }

    public function test_both_without_seats_are_merged(): void
    {
        Queue::fake();
        $this->send([$this->ride(['seats' => null])]);
        $this->send([$this->twin(['seats' => null])]);

        $this->assertCount(1, $this->visible());
    }

    // Lưu cuốc và đánh dấu trùng nằm trong một giao dịch: đánh dấu lỗi thì cả lô không được lưu dở.
    public function test_storing_and_marking_duplicates_is_atomic(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        FreeRide::updating(function (FreeRide $r) {
            if ($r->isDirty('duplicate_of_id')) {
                throw new \RuntimeException('lỗi giả lập');
            }
        });

        $this->withoutExceptionHandling();
        try {
            $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$this->twin()]]);
            $this->fail('Phải ném lỗi');
        } catch (\RuntimeException) {
        }

        $this->assertNull(FreeRide::where('ride_uid', 'r-2')->first());
    }

    public function test_both_without_pickup_time_are_merged(): void
    {
        Queue::fake();
        $this->send([$this->ride(['pickup_at' => null])]);
        $this->send([$this->twin(['pickup_at' => null])]);

        $this->assertCount(1, $this->visible());
    }

    public function test_raw_rides_are_merged_by_normalized_raw_text(): void
    {
        Queue::fake();
        $raw = ['is_raw' => true, 'pickup' => null, 'destination' => null, 'direction' => null, 'pickup_at' => null];
        $this->send([$this->ride($raw + ['raw_text' => 'Cần xe   đi Nội Bài 5h'])]);
        $this->send([$this->twin($raw + ['raw_text' => ' cần xe đi nội bài 5h '])]);
        $this->send([$this->twin($raw + ['ride_uid' => 'r-3', 'raw_text' => 'cần xe đi nội bài 6h'])]);

        $this->assertSame(['r-3', 'r-1'], array_column($this->visible(), 'ride_uid'));
    }

    public function test_expired_canonical_is_not_a_merge_target(): void
    {
        Queue::fake();
        $this->send([$this->ride(['expires_at' => now()->addMinutes(5)->getTimestampMs()])]);
        $this->travel(10)->minutes();
        $this->send([$this->twin(['pickup_at' => now()->addMinutes(50)->getTimestampMs()])]);

        $this->assertNull(FreeRide::where('ride_uid', 'r-2')->value('duplicate_of_id'));
        $this->assertSame(['r-2'], array_column($this->visible(), 'ride_uid'));
    }

    // ---- cuốc gốc hết hạn / bị xoá / nhóm bị tắt ----

    public function test_duplicate_becomes_visible_when_canonical_expires(): void
    {
        Queue::fake();
        $this->send([$this->ride(['expires_at' => now()->addMinutes(30)->getTimestampMs(), 'group_count' => 2])]);
        $this->send([$this->twin(['group_count' => 3])]);
        $this->travel(31)->minutes();

        $data = $this->visible();
        $this->assertSame(['r-2'], array_column($data, 'ride_uid'));
        $this->assertSame(3, $data[0]['group_count']);
    }

    public function test_duplicate_becomes_visible_when_canonical_is_deleted(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        $this->send([$this->twin()]);
        FreeRide::where('ride_uid', 'r-1')->delete();

        $this->assertSame(['r-2'], array_column($this->visible(), 'ride_uid'));
    }

    public function test_duplicate_becomes_visible_when_canonical_group_is_disabled(): void
    {
        Queue::fake();
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Nhóm Một', 'enabled' => true]);
        $this->send([$this->ride()]);
        $this->send([$this->twin()]);
        ZaloGroup::where('zalo_group_id', 'g1')->update(['enabled' => false]);

        $this->assertSame(['r-2'], array_column($this->visible(), 'ride_uid'));
    }

    // ---- cảnh báo đẩy ----

    public function test_push_job_does_not_push_duplicates(): void
    {
        Queue::fake();
        Notification::fake();
        $driver = $this->driver(withToken: true);
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->send([$this->ride()]);
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();
        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);

        // Hết 2 phút chặn rồi bản trùng mới tới → không có push nào nữa.
        $this->travel(3)->minutes();
        $this->send([$this->twin(['posted_at' => now()->getTimestampMs()])]);
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentToTimes($driver, FreeRideMatchNotification::class, 1);
    }

    public function test_push_contains_the_merged_ride_once(): void
    {
        Queue::fake();
        Notification::fake();
        $driver = $this->driver(withToken: true);
        DriverFreeRideAlert::create(['driver_id' => $driver->id, 'enabled' => true]);
        $this->travel(1)->second();

        $this->send([$this->ride(), $this->twin()]);
        $this->travel(1)->second();
        (new NotifyFreeRideAlerts)->handle();

        Notification::assertSentTo($driver, FreeRideMatchNotification::class,
            fn (FreeRideMatchNotification $n) => str_starts_with($n->toWebPush($driver, $n)['body'], 'Cuốc Free: Phố Cổ'));
    }

    // ---- admin ----

    public function test_admin_sender_counts_count_merged_rides_once(): void
    {
        Queue::fake();
        $this->send([$this->ride()]);
        $this->send([$this->twin()]);
        // Một cuốc khác hẳn của cùng người.
        $this->send([$this->twin(['ride_uid' => 'r-3', 'pickup' => 'Hà Đông'])]);

        $admin = User::factory()->create(['role' => 'admin']);
        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->assertOk()->json('data'))
            ->firstWhere('qr_code', 'QRDUC');

        $this->assertSame(2, $row['active_rides']);
        $this->assertSame(2, $row['rides_7d']);
        $this->assertSame(['111', '222'], $row['sender_uids']);
    }

    public function test_admin_active_count_includes_duplicate_once_canonical_expired(): void
    {
        Queue::fake();
        $this->send([$this->ride(['expires_at' => now()->addMinutes(30)->getTimestampMs()])]);
        $this->send([$this->twin()]);
        $this->travel(31)->minutes();

        $admin = User::factory()->create(['role' => 'admin']);
        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/free-rides/senders')->assertOk()->json('data'))
            ->firstWhere('qr_code', 'QRDUC');

        $this->assertSame(1, $row['active_rides']);
        $this->assertSame(1, $row['rides_7d']);
    }
}
