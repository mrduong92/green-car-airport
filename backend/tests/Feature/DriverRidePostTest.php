<?php

namespace Tests\Feature;

use App\Jobs\BroadcastFreeRidesSignal;
use App\Jobs\ParseDriverRide;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

class DriverRidePostTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
        Bus::fake([BroadcastFreeRidesSignal::class, ParseDriverRide::class]);
    }

    private function driver(bool $termsAccepted = true, string $status = 'active'): User
    {
        $u = User::factory()->create(['role' => 'driver', 'name' => 'Tài Xế A']);
        DriverProfile::create([
            'user_id' => $u->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
            'ride_post_terms_accepted_at' => $termsAccepted ? now() : null,
        ]);

        return $u;
    }

    private function postRide(User $u, array $body)
    {
        return $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides', $body);
    }

    public function test_requires_terms_then_accepting_allows_post(): void
    {
        $u = $this->driver(termsAccepted: false);

        $this->postRide($u, ['text' => 'tiễn Mỹ Đình 15h'])->assertStatus(409)->assertJsonPath('code', 'ride_post_terms_required');
        $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides/terms')->assertOk();
        $this->postRide($u, ['text' => 'tiễn Mỹ Đình 15h'])->assertCreated();
    }

    public function test_stores_driver_ride_and_dispatches_jobs(): void
    {
        $u = $this->driver();

        $res = $this->postRide($u, ['text' => 'Tiễn Mỹ Đình 15h mai xe 5 250k', 'contact_zalo' => false])->assertCreated();

        $ride = FreeRide::sole();
        $this->assertSame($u->id, $ride->posted_by_user_id);
        $this->assertSame('gca_'.$u->id, $ride->sender_uid);
        $this->assertSame('Tài Xế A', $ride->sender_name);
        $this->assertNull($ride->qr_code);
        $this->assertNull($ride->zalo_group_id);
        $this->assertTrue($ride->is_raw);
        $this->assertFalse($ride->contact_zalo);
        $this->assertSame('pending', $ride->parse_status);
        $this->assertTrue($ride->expires_at->eq(now()->addHours(3)));
        $this->assertStringStartsWith('gca-', $ride->ride_uid);
        $res->assertJsonPath('ride_uid', $ride->ride_uid)->assertJsonPath('is_mine', true)->assertJsonPath('source', 'driver');
        Bus::assertDispatched(ParseDriverRide::class, fn ($j) => $j->rideId === $ride->id);
        Bus::assertDispatched(BroadcastFreeRidesSignal::class);
    }

    public function test_poster_comes_from_token_not_payload(): void
    {
        $u = $this->driver();
        $other = $this->driver();

        $this->postRide($u, ['text' => 'tiễn 15h', 'user_id' => $other->id, 'posted_by_user_id' => $other->id])->assertCreated();

        $this->assertSame($u->id, FreeRide::sole()->posted_by_user_id);
    }

    public function test_phones_are_masked_on_save(): void
    {
        $this->postRide($this->driver(), ['text' => "tiễn Cầu Giấy 15h lh 0912 345 678\nkhách 0987654321"])->assertCreated();

        $raw = FreeRide::sole()->raw_text;
        $this->assertStringNotContainsString('0912', $raw);
        $this->assertStringNotContainsString('0987654321', $raw);
        $this->assertStringContainsString('•••••••••', $raw);
    }

    public function test_whitespace_only_text_rejected(): void
    {
        $this->postRide($this->driver(), ['text' => "   \n  "])->assertStatus(422);
    }

    public function test_too_long_text_rejected(): void
    {
        $this->postRide($this->driver(), ['text' => str_repeat('a', 1001)])->assertStatus(422);
    }

    public function test_daily_limit(): void
    {
        $u = $this->driver();
        for ($i = 0; $i < 20; $i++) {
            $this->travel(7)->seconds(); // né throttle:10,1
            $this->postRide($u, ['text' => "cuốc $i"])->assertCreated();
        }

        $this->travel(7)->seconds();
        $this->postRide($u, ['text' => 'cuốc 21'])->assertStatus(429)->assertJsonPath('code', 'daily_post_limit');
    }

    public function test_post_limit_not_eaten_by_other_throttled_routes(): void
    {
        // throttle:N,M không có tiền tố dùng chung một khoá theo user cho mọi route — ping app-presence
        // (45 giây/lần) + thao tác khác từng ăn vào giới hạn đăng cuốc.
        $u = $this->driver();
        for ($i = 0; $i < 12; $i++) {
            $this->actingAs($u, 'sanctum')->postJson('/api/driver/app-presence', ['active' => true]);
        }

        $this->postRide($u, ['text' => 'tiễn 15h'])->assertCreated();
        $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides/unlock-request')->assertOk();
    }

    public function test_pending_or_blocked_driver_cannot_post(): void
    {
        $this->postRide($this->driver(status: 'pending'), ['text' => 'tiễn 15h'])->assertForbidden();
    }

    public function test_disabled_tab_returns_404(): void
    {
        config(['zalo.free_rides_enabled' => false]);

        $this->postRide($this->driver(), ['text' => 'tiễn 15h'])->assertNotFound();
    }
}
