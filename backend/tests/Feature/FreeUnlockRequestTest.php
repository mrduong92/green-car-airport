<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FreeUnlockRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-17 10:00:00')); // app timezone = Asia/Ho_Chi_Minh
    }

    private function driver(bool $unlocked = false): User
    {
        $u = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $u->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'free_unlocked_until' => $unlocked ? now()->addYear() : null,
        ]);

        return $u;
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    public function test_request_records_time_and_shows_in_access(): void
    {
        $u = $this->driver();

        $this->actingAs($u, 'sanctum')->postJson('/api/driver/free-rides/unlock-request')->assertOk()
            ->assertJsonPath('requested_at', now()->getTimestampMs());
        $this->actingAs($u, 'sanctum')->getJson('/api/driver/free-rides')->assertJsonPath('access.requested_at', now()->getTimestampMs());
    }

    public function test_already_unlocked_returns_409(): void
    {
        $this->actingAs($this->driver(unlocked: true), 'sanctum')->postJson('/api/driver/free-rides/unlock-request')
            ->assertStatus(409)->assertJsonPath('code', 'already_unlocked');
    }

    public function test_admin_filter_lists_only_pending_requests(): void
    {
        $requested = $this->driver();
        $this->actingAs($requested, 'sanctum')->postJson('/api/driver/free-rides/unlock-request');
        $this->driver();

        $rows = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/drivers?free_unlock_requested=1')->assertOk()->json();
        $this->assertSame([$requested->id], array_column($rows, 'id'));
        $this->assertSame(now()->getTimestampMs(), $rows[0]['free_unlock_requested_at']);
    }

    public function test_grant_clears_request_and_contact_appears(): void
    {
        $viewer = $this->driver();
        $poster = $this->driver(unlocked: true);
        FreeRide::create([
            'ride_uid' => 'gca-x', 'sender_uid' => FreeRide::driverSenderUid($poster->id), 'sender_name' => 'P', 'group_name' => '',
            'posted_by_user_id' => $poster->id, 'is_raw' => true, 'is_free' => false, 'raw_text' => 'tiễn', 'group_count' => 1,
            'posted_at' => now(), 'expires_at' => now()->addHours(3), 'parse_status' => 'done',
        ]);
        $this->actingAs($viewer, 'sanctum')->postJson('/api/driver/free-rides/unlock-request');
        $this->assertNull($this->actingAs($viewer, 'sanctum')->getJson('/api/driver/free-rides')->json('data.0.contact'));

        $this->actingAs($this->admin(), 'sanctum')->postJson("/api/admin/drivers/{$viewer->id}/free-unlock")->assertOk()
            ->assertJsonPath('free_unlock_requested_at', null);

        // fresh(): actingAs giữ nguyên đối tượng user (kèm driverProfile đã nạp) — request thật nạp lại từ DB.
        $this->assertSame($poster->phone, $this->actingAs($viewer->fresh(), 'sanctum')->getJson('/api/driver/free-rides')->json('data.0.contact.phone'));
    }

    public function test_revoke_does_not_recreate_request(): void
    {
        $u = $this->driver(unlocked: true);

        $this->actingAs($this->admin(), 'sanctum')->deleteJson("/api/admin/drivers/{$u->id}/free-unlock")->assertOk()
            ->assertJsonPath('free_unlock_requested_at', null);
    }
}
