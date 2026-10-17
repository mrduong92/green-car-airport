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

class DriverRideManageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
        Bus::fake([BroadcastFreeRidesSignal::class, ParseDriverRide::class]);
    }

    private function driver(): User
    {
        $u = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $u->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'ride_post_terms_accepted_at' => now(), 'free_unlocked_until' => now()->addYear(),
        ]);

        return $u;
    }

    private function postRide(User $u, string $text = 'tiễn 15h'): string
    {
        $this->travel(7)->seconds();

        return $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides', ['text' => $text])->assertCreated()->json('ride_uid');
    }

    public function test_close_removes_from_list_and_keeps_in_mine(): void
    {
        $u = $this->driver();
        $uid = $this->postRide($u);

        $this->actingAs($u, 'sanctum')->patchJson("/api/driver/free-rides/$uid/close")->assertOk()->assertJsonPath('ride_uid', $uid);

        $this->assertSame([], $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
        $mine = $this->actingAs($u, 'sanctum')->getJson('/api/driver/free-rides/mine')->assertOk()->json('data');
        $this->assertSame($uid, $mine[0]['ride_uid']);
        $this->assertNotNull($mine[0]['closed_at']);
        Bus::assertDispatched(BroadcastFreeRidesSignal::class);
    }

    public function test_delete_hides_everywhere(): void
    {
        $u = $this->driver();
        $uid = $this->postRide($u);

        $this->actingAs($u, 'sanctum')->deleteJson("/api/driver/free-rides/$uid")->assertOk();

        $this->assertSame([], $this->actingAs($u, 'sanctum')->getJson('/api/driver/free-rides/mine')->json('data'));
        $ride = FreeRide::where('ride_uid', $uid)->sole();
        $this->assertNotNull($ride->closed_at);
        $this->assertNotNull($ride->deleted_at);
    }

    public function test_others_cannot_close_or_delete(): void
    {
        $uid = $this->postRide($this->driver());
        $other = $this->driver();

        $this->actingAs($other, 'sanctum')->patchJson("/api/driver/free-rides/$uid/close")->assertForbidden();
        $this->actingAs($other, 'sanctum')->deleteJson("/api/driver/free-rides/$uid")->assertForbidden();
    }

    public function test_cannot_touch_zalo_rides(): void
    {
        FreeRide::create([
            'ride_uid' => 'z-1', 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => 'abc', 'zalo_group_id' => 'g1', 'group_name' => 'N',
            'is_free' => false, 'is_raw' => true, 'raw_text' => 'tin', 'group_count' => 1, 'posted_at' => now(), 'expires_at' => now()->addHour(),
        ]);

        $this->actingAs($this->driver(), 'sanctum')->deleteJson('/api/driver/free-rides/z-1')->assertForbidden();
    }

    public function test_mine_only_own_and_last_7_days(): void
    {
        $u = $this->driver();
        $old = $this->postRide($u, 'cũ');
        $this->travel(8)->days();
        $new = $this->postRide($u, 'mới');
        $this->postRide($this->driver(), 'của người khác');

        $uids = array_column($this->actingAs($u, 'sanctum')->getJson('/api/driver/free-rides/mine')->json('data'), 'ride_uid');
        $this->assertSame([$new], $uids);
        $this->assertNotContains($old, $uids);
    }

    public function test_since_reports_removed_rides(): void
    {
        $u = $this->driver();
        $viewer = $this->driver();
        $uid = $this->postRide($u);
        $since = now()->getTimestampMs();
        $this->travel(5)->seconds();

        $this->actingAs($u, 'sanctum')->patchJson("/api/driver/free-rides/$uid/close")->assertOk();

        $res = $this->actingAs($viewer, 'sanctum')->getJson("/api/driver/free-rides?since=$since")->assertOk();
        $this->assertSame([$uid], $res->json('removed'));
    }

    public function test_daily_limit_not_bypassed_by_deleting(): void
    {
        $u = $this->driver();
        for ($i = 0; $i < 20; $i++) {
            $uid = $this->postRide($u, "cuốc $i");
            $this->actingAs($u, 'sanctum')->deleteJson("/api/driver/free-rides/$uid")->assertOk();
            $this->travel(1)->minutes(); // throttle đếm chung một khoá theo user cho mọi route → né giới hạn phút
        }

        $this->travel(7)->seconds();
        $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides', ['text' => 'cuốc 21'])->assertStatus(429);
    }
}
