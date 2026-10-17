<?php

namespace Tests\Feature;

use App\Jobs\BroadcastFreeRidesSignal;
use App\Jobs\NotifyFreeRideAlerts;
use App\Jobs\ParseDriverRide;
use App\Models\FreeRide;
use App\Models\User;
use App\Services\RideParser\OpenAiRideParser;
use App\Services\RideParser\RideDraft;
use App\Services\RideParser\RideParseFailed;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

class ParseDriverRideTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
        Bus::fake([BroadcastFreeRidesSignal::class, NotifyFreeRideAlerts::class]);
    }

    private function ride(array $o = []): FreeRide
    {
        $u = User::factory()->create(['role' => 'driver']);

        return FreeRide::create(array_merge([
            'ride_uid' => 'gca-p1', 'sender_uid' => FreeRide::driverSenderUid($u->id), 'sender_name' => 'A', 'group_name' => '',
            'posted_by_user_id' => $u->id, 'is_raw' => true, 'is_free' => false, 'raw_text' => 'tiễn Mỹ Đình 15h', 'group_count' => 1,
            'posted_at' => now(), 'expires_at' => now()->addHours(3), 'parse_status' => 'pending',
        ], $o));
    }

    private function parserReturns(?RideDraft $draft): void
    {
        $this->mock(OpenAiRideParser::class)->shouldReceive('parse')->andReturn($draft);
    }

    private function draft(?Carbon $pickupAt): RideDraft
    {
        return new RideDraft('to_airport', 'Mỹ Đình', 'Sân bay Nội Bài', $pickupAt, '15:00', 5, null, 250000, true);
    }

    public function test_success_fills_columns_and_expiry_and_signals(): void
    {
        $ride = $this->ride();
        $this->parserReturns($this->draft(Carbon::parse('2026-10-17 15:00:00')));

        ParseDriverRide::dispatchSync($ride->id);

        $ride->refresh();
        $this->assertSame('done', $ride->parse_status);
        $this->assertSame('to_airport', $ride->direction);
        $this->assertSame(5, $ride->seats);
        $this->assertTrue($ride->expires_at->eq(Carbon::parse('2026-10-17 15:30:00')));
        $this->assertTrue($ride->is_raw); // thẻ vẫn hiện nguyên văn tin
        Bus::assertDispatched(BroadcastFreeRidesSignal::class);
        Bus::assertDispatched(NotifyFreeRideAlerts::class);
    }

    public function test_utc_pickup_time_stored_as_same_instant(): void
    {
        // Eloquent ghi Carbon theo múi giờ của chính nó (không đổi sang app timezone) → mốc UTC phải được
        // đổi trước khi lưu, nếu không giờ đón lệch 7 tiếng.
        $ride = $this->ride();
        $pickup = Carbon::parse('2026-10-17 15:00', 'Asia/Ho_Chi_Minh')->utc();
        $this->parserReturns($this->draft($pickup));

        ParseDriverRide::dispatchSync($ride->id);

        $ride->refresh();
        $this->assertTrue($ride->pickup_at->eq($pickup));
        $this->assertTrue($ride->expires_at->eq($pickup->copy()->addMinutes(30)));
    }

    public function test_past_pickup_time_keeps_ride_alive_at_least_30_minutes(): void
    {
        $ride = $this->ride();
        $this->parserReturns($this->draft(now()->subHours(5)));

        ParseDriverRide::dispatchSync($ride->id);

        $this->assertTrue($ride->refresh()->expires_at->eq(now()->addMinutes(30)));
    }

    public function test_far_future_capped_at_7_days(): void
    {
        $ride = $this->ride();
        $this->parserReturns($this->draft(now()->addDays(30)));

        ParseDriverRide::dispatchSync($ride->id);

        $this->assertTrue($ride->refresh()->expires_at->eq(now()->addDays(7)));
    }

    public function test_not_a_ride_marks_failed_keeps_expiry(): void
    {
        $ride = $this->ride();
        $this->parserReturns(null);

        ParseDriverRide::dispatchSync($ride->id);

        $ride->refresh();
        $this->assertSame('failed', $ride->parse_status);
        $this->assertNull($ride->direction);
        $this->assertTrue($ride->expires_at->eq(now()->addHours(3)));
        Bus::assertDispatched(NotifyFreeRideAlerts::class);
    }

    public function test_parser_error_marks_failed(): void
    {
        $ride = $this->ride();
        $this->mock(OpenAiRideParser::class)->shouldReceive('parse')->andThrow(new RideParseFailed('http_429'));

        ParseDriverRide::dispatchSync($ride->id);

        $this->assertSame('failed', $ride->refresh()->parse_status);
    }

    public function test_failed_job_still_schedules_alerts(): void
    {
        $ride = $this->ride();

        (new ParseDriverRide($ride->id))->failed();

        $this->assertSame('failed', $ride->refresh()->parse_status);
        Bus::assertDispatched(NotifyFreeRideAlerts::class);
    }

    public function test_closed_or_already_parsed_ride_skipped(): void
    {
        $closed = $this->ride(['closed_at' => now()]);
        $this->mock(OpenAiRideParser::class)->shouldNotReceive('parse');

        ParseDriverRide::dispatchSync($closed->id);
        ParseDriverRide::dispatchSync(999999);

        $this->assertSame('pending', $closed->refresh()->parse_status);
    }
}
