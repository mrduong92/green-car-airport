<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\DriverProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverReferralListTest extends TestCase
{
    use RefreshDatabase;

    private function f1(User $referrer, string $status, int $trips, bool $rewarded = false, string $role = 'driver'): User
    {
        $u = User::factory()->create([
            'role' => $role,
            'referred_by_user_id' => $referrer->id,
            'referral_rewarded_at' => $rewarded ? now() : null,
        ]);
        if ($role === 'driver') {
            DriverProfile::create([
                'user_id' => $u->id, 'status' => $status, 'trips_count' => $trips,
                'vehicle_make' => 'Toyota', 'vehicle_model' => 'Camry', 'vehicle_plate' => '51G-'.$u->id,
                'vehicle_year' => 2020, 'vehicle_color' => 'White',
            ]);
        }

        return $u;
    }

    public function test_lists_only_driver_f1_with_status_and_reward(): void
    {
        AppSetting::set(AppSetting::REFERRAL_DRIVER_POINTS, '70');
        $me = User::factory()->create(['role' => 'driver']);
        $this->f1($me, 'active', 3, true);
        $this->f1($me, 'pending', 1);
        $this->f1($me, 'active', 0);
        $this->f1($me, 'active', 0, false, 'customer'); // khách do tài xế giới thiệu — không phải F1 tài xế
        $other = User::factory()->create(['role' => 'driver']);
        $this->f1($other, 'active', 5, true);

        $res = $this->actingAs($me, 'sanctum')->getJson('/api/driver/referrals')->assertOk();

        $this->assertSame(3, $res->json('total_f1'));
        $this->assertSame(1, $res->json('rewarded_count'));
        $this->assertSame(70, $res->json('total_reward_points'));
        $this->assertSame(70, $res->json('reward_points_per_referral'));
        $this->assertEqualsCanonicalizing(
            ['rewarded', 'waiting_approval', 'waiting_trip'],
            collect($res->json('items'))->pluck('status')->all(),
        );
        $this->assertStringContainsString('***', $res->json('items.0.phone_masked'));
    }

    public function test_customer_cannot_access(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->actingAs($c, 'sanctum')->getJson('/api/driver/referrals')->assertForbidden();
    }
}
