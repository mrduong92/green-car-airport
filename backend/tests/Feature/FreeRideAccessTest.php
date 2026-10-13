<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FreeRideAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-16 03:00:00'));
    }

    private function profile(?Carbon $until): DriverProfile
    {
        $user = User::factory()->create(['role' => 'driver']);

        return DriverProfile::create([
            'user_id' => $user->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios',
            'vehicle_plate' => '30A-'.random_int(10000, 99999), 'vehicle_year' => 2021,
            'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
            'free_unlocked_until' => $until,
        ]);
    }

    public function test_has_free_access_only_while_unlocked_until_is_in_the_future(): void
    {
        $this->assertFalse($this->profile(null)->hasFreeAccess());
        $this->assertFalse($this->profile(now()->subSecond())->hasFreeAccess());
        $this->assertFalse($this->profile(now())->hasFreeAccess());
        $this->assertTrue($this->profile(now()->addDay())->hasFreeAccess());
    }
}
