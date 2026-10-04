<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
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
