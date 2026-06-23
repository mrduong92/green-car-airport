<?php
// backend/tests/Feature/UserReferralCodeTest.php
namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserReferralCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_referral_code_auto_generated_on_create(): void
    {
        $user = User::factory()->create();

        $this->assertNotNull($user->referral_code);
        $this->assertStringStartsWith(config('app.code_prefix') . '-', $user->referral_code);
        $this->assertEquals(10, strlen($user->referral_code));
    }

    public function test_referral_codes_are_unique_across_users(): void
    {
        $users = User::factory()->count(10)->create();
        $codes = $users->pluck('referral_code')->unique();

        $this->assertCount(10, $codes);
    }

    public function test_referred_by_relationship_returns_referrer(): void
    {
        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create(['referred_by_user_id' => $referrer->id]);

        $this->assertEquals($referrer->id, $newDriver->referredBy->id);
    }
}
