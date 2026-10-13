<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AdminDriverFreeAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-16 03:00:00'));
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function driver(?Carbon $until = null): User
    {
        $user = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $user->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'free_unlocked_until' => $until,
        ]);

        return $user;
    }

    public function test_grant_unlocks_for_one_year_from_now(): void
    {
        $driver = $this->driver();

        $res = $this->actingAs($this->admin(), 'sanctum')->postJson("/api/admin/drivers/{$driver->id}/free-unlock")->assertOk();

        $this->assertTrue($res->json('free_unlocked'));
        $this->assertSame(now()->addYear()->getTimestampMs(), $res->json('free_unlocked_until'));
        $this->assertTrue($driver->driverProfile->fresh()->hasFreeAccess());
    }

    public function test_grant_while_still_unlocked_extends_from_current_expiry(): void
    {
        $current = now()->addMonths(2);
        $driver = $this->driver($current);

        $res = $this->actingAs($this->admin(), 'sanctum')->postJson("/api/admin/drivers/{$driver->id}/free-unlock")->assertOk();

        $this->assertSame($current->copy()->addYear()->getTimestampMs(), $res->json('free_unlocked_until'));
    }

    public function test_grant_after_expiry_counts_from_now_not_from_old_expiry(): void
    {
        $driver = $this->driver(now()->subMonths(3));

        $res = $this->actingAs($this->admin(), 'sanctum')->postJson("/api/admin/drivers/{$driver->id}/free-unlock")->assertOk();

        $this->assertSame(now()->addYear()->getTimestampMs(), $res->json('free_unlocked_until'));
    }

    public function test_revoke_locks_immediately(): void
    {
        $driver = $this->driver(now()->addMonths(5));

        $res = $this->actingAs($this->admin(), 'sanctum')->deleteJson("/api/admin/drivers/{$driver->id}/free-unlock")->assertOk();

        $this->assertFalse($res->json('free_unlocked'));
        $this->assertNull($res->json('free_unlocked_until'));
        $this->assertFalse($driver->driverProfile->fresh()->hasFreeAccess());
    }

    public function test_rejects_non_driver_and_driver_without_profile(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $noProfile = User::factory()->create(['role' => 'driver']);
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/drivers/{$customer->id}/free-unlock")->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/drivers/{$noProfile->id}/free-unlock")->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/drivers/{$noProfile->id}/free-unlock")->assertStatus(422);
    }

    public function test_only_admin_can_grant(): void
    {
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->postJson("/api/admin/drivers/{$driver->id}/free-unlock")->assertStatus(403);
        $this->assertFalse($driver->driverProfile->fresh()->hasFreeAccess());
    }

    public function test_driver_list_reports_free_access(): void
    {
        $this->driver(now()->addDay());

        $row = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/admin/drivers')->assertOk()->json('0');

        $this->assertTrue($row['free_unlocked']);
        $this->assertSame(now()->addDay()->getTimestampMs(), $row['free_unlocked_until']);
    }
}
