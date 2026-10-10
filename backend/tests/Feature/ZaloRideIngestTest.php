<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use App\Services\Zalo\ZaloRideIngestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloRideIngestTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-06 03:00:00'));
    }

    private function ride(array $overrides = []): array
    {
        return array_merge([
            'ride_uid' => 'r-1', 'sender_uid' => '111', 'sender_name' => 'Hoàng Anh Đức', 'qr_code' => '758z6tl22yft',
            'zalo_group_id' => 'g1', 'group_name' => 'Taxi Nội Bài', 'direction' => 'to_airport',
            'pickup' => 'phố cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => now()->addHour()->getTimestampMs(), 'pickup_time_text' => '4h15',
            'seats' => 5, 'vehicle_note' => null, 'price' => 200000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => 'tiễn 4h15 phố cổ 200k', 'group_count' => 1,
            'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHours(2)->getTimestampMs(),
        ], $overrides);
    }

    private function send(array $rides)
    {
        return $this->zaloPost('/api/internal/zalo/rides', ['rides' => $rides]);
    }

    public function test_stores_rides(): void
    {
        $this->send([$this->ride(), $this->ride(['ride_uid' => 'r-2', 'direction' => null, 'is_raw' => true, 'pickup' => null])])
            ->assertOk()->assertExactJson(['stored' => 2, 'rejected' => []]);

        $ride = FreeRide::where('ride_uid', 'r-1')->first();
        $this->assertSame('phố cổ', $ride->pickup);
        $this->assertSame(200000, $ride->price);
        $this->assertSame('758z6tl22yft', $ride->qr_code);
        $this->assertTrue($ride->expires_at->eq(now()->addHours(2)));
    }

    // Mốc ms từ service là instant tuyệt đối. Carbon::createFromTimestampMs() mặc định trả về UTC,
    // còn Eloquent ghi chuỗi 'Y-m-d H:i:s' KHÔNG đổi múi giờ → app chạy Asia/Ho_Chi_Minh sẽ lưu
    // lệch 7 tiếng (cuốc vừa vào đã hết hạn). So sánh chuỗi giờ đã lưu, không chỉ instant.
    public function test_ms_timestamps_are_stored_in_app_timezone(): void
    {
        $this->assertSame('Asia/Ho_Chi_Minh', config('app.timezone'));

        $this->send([$this->ride()])->assertOk();

        $raw = FreeRide::query()->toBase()->where('ride_uid', 'r-1')->first();
        $this->assertSame(now()->format('Y-m-d H:i:s'), $raw->posted_at);
        $this->assertSame(now()->addHours(2)->format('Y-m-d H:i:s'), $raw->expires_at);
        $this->assertSame(now()->addHour()->format('Y-m-d H:i:s'), $raw->pickup_at);
        $this->assertTrue(FreeRide::first()->expires_at->isFuture());
    }

    // Ingest tuần tự (khoá zalo:ingest) để id cuốc commit đúng thứ tự — NotifyFreeRideAlerts dựa vào
    // mốc id. Khoá đang bị giữ quá lâu → 503 (service coi là lỗi, thử lại sau) và không lưu gì.
    public function test_held_ingest_lock_returns_503_and_stores_nothing(): void
    {
        config(['zalo.ingest_lock_wait_seconds' => 0]);
        $lock = Cache::lock('zalo:ingest', 30);
        $this->assertTrue($lock->get());

        $this->send([$this->ride()])->assertStatus(503);
        $this->assertSame(0, FreeRide::count());

        $lock->release();
        $this->send([$this->ride()])->assertOk()->assertExactJson(['stored' => 1, 'rejected' => []]);
    }

    // Một lô phải CHỜ khoá 'zalo:ingest' (đang bị lô khác giữ) có thể commit SAU khi một lô thứ
    // ba (không phải chờ) đã lấy mốc giờ muộn hơn và commit trước. Nếu mốc giờ của lô chờ được
    // lấy TRƯỚC khi xin khoá (lúc vào hàm) thay vì SAU khi đã giữ được khoá, hàng nó ghi sẽ mang
    // updated_at CŨ hơn hàng đã commit trước đó — client poll theo since=updated_at sẽ bỏ sót
    // vĩnh viễn. Giả lập việc "chờ khoá" bằng cách thay Cache::lock() trả về một khoá giả: lúc
    // block() gọi callback (tức thời điểm THỰC SỰ giữ được khoá), đồng hồ giả đã nhảy tới mốc
    // muộn hơn mốc lúc gọi send() — đúng như một lô khác đã trôi qua trong lúc lô này còn chờ.
    public function test_row_timestamp_uses_time_after_lock_acquired_not_before(): void
    {
        config(['zalo.ingest_lock_wait_seconds' => 15]);

        $acquiredAt = Carbon::parse('2026-10-06 03:05:00');
        $this->assertTrue(now()->lt($acquiredAt), 'mốc giờ lúc gọi send() phải SỚM hơn mốc lúc giữ được khoá');

        $fakeLock = Mockery::mock();
        $fakeLock->shouldReceive('block')->once()->andReturnUsing(function ($wait, $callback) use ($acquiredAt) {
            Carbon::setTestNow($acquiredAt);

            return $callback();
        });

        // Mock bộ phận ("partial") thay vì mock toàn bộ facade Cache: chỉ chặn lock(), các lệnh
        // gọi cache khác (RateLimiter của middleware throttle, v.v.) vẫn chạy bình thường qua
        // CacheManager thật — mock toàn bộ facade sẽ vỡ các lệnh gọi cache không liên quan đó.
        $cacheSpy = Mockery::mock(app('cache'))->makePartial();
        $cacheSpy->shouldReceive('lock')->once()->with(ZaloRideIngestService::LOCK_KEY, 30)->andReturn($fakeLock);
        app()->instance('cache', $cacheSpy);
        Cache::clearResolvedInstance('cache');

        $this->send([$this->ride()])->assertOk()->assertExactJson(['stored' => 1, 'rejected' => []]);

        $ride = FreeRide::where('ride_uid', 'r-1')->first();
        $this->assertTrue(
            $ride->updated_at->gte($acquiredAt),
            'updated_at phải lấy theo mốc giờ lúc GIỮ ĐƯỢC khoá, không phải lúc gọi ingest()',
        );
        $this->assertTrue($ride->created_at->gte($acquiredAt));
    }

    public function test_resending_updates_instead_of_duplicating(): void
    {
        $this->send([$this->ride()])->assertOk();
        $this->send([$this->ride(['group_count' => 3, 'qr_code' => 'newcode'])])->assertOk();

        $this->assertSame(1, FreeRide::count());
        $this->assertSame(3, FreeRide::first()->group_count);
        $this->assertSame('newcode', FreeRide::first()->qr_code);
    }

    public function test_malformed_ride_is_rejected_alone(): void
    {
        $this->send([$this->ride(), ['ride_uid' => 'x'], $this->ride(['ride_uid' => 'r-3', 'direction' => 'bay'])])
            ->assertOk()->assertJson(['stored' => 1, 'rejected' => [1, 2]]);
    }

    public function test_long_text_fields_are_truncated(): void
    {
        $this->send([$this->ride(['pickup' => str_repeat('p', 400), 'sender_name' => str_repeat('s', 400), 'raw_text' => str_repeat('r', 5000)])])
            ->assertOk()->assertJson(['stored' => 1]);

        $ride = FreeRide::first();
        $this->assertSame(255, mb_strlen($ride->pickup));
        $this->assertSame(255, mb_strlen($ride->sender_name));
        $this->assertSame(4000, mb_strlen($ride->raw_text));
    }

    public function test_batch_over_limit_is_422(): void
    {
        $rides = array_map(fn ($i) => $this->ride(['ride_uid' => "r-$i"]), range(1, 101));

        $this->send($rides)->assertStatus(422);
    }

    public function test_ride_without_qr_code_is_rejected_alone(): void
    {
        $this->send([
            $this->ride(),
            $this->ride(['ride_uid' => 'r-no-qr', 'qr_code' => null]),
            $this->ride(['ride_uid' => 'r-bad-qr', 'qr_code' => 'abc/../x']),
        ])->assertOk()->assertJson(['stored' => 1, 'rejected' => [1, 2]]);

        $this->assertSame(1, FreeRide::count());
    }

    public function test_oversized_price_and_group_count_are_rejected_individually_and_logged(): void
    {
        Log::spy();

        $this->send([
            $this->ride(),
            $this->ride(['ride_uid' => 'r-big-price', 'price' => 4294967296]),
            $this->ride(['ride_uid' => 'r-big-count', 'group_count' => 65536]),
            $this->ride(['ride_uid' => 'r-4']),
        ])->assertOk()->assertExactJson(['stored' => 2, 'rejected' => [1, 2]]);

        $this->assertEqualsCanonicalizing(['r-1', 'r-4'], FreeRide::pluck('ride_uid')->all());
        Log::shouldHaveReceived('warning')->once()->withArgs(function (string $message, array $context) {
            return str_contains($message, 'loại 2 cuốc')
                && array_keys($context['rejected']) === [1, 2]
                && isset($context['rejected'][1]['price']);
        });
    }

    public function test_long_vehicle_note_and_time_text_are_truncated_and_stored(): void
    {
        $this->send([$this->ride(['vehicle_note' => str_repeat('v', 50), 'pickup_time_text' => str_repeat('t', 40)])])
            ->assertOk()->assertExactJson(['stored' => 1, 'rejected' => []]);

        $ride = FreeRide::first();
        $this->assertSame(str_repeat('v', 32), $ride->vehicle_note);
        $this->assertSame(str_repeat('t', 32), $ride->pickup_time_text);
    }
}
