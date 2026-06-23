<?php
// backend/tests/Feature/ReferralTriggerTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ReferralTriggerTest extends TestCase
{
    use RefreshDatabase;

    public function test_driver_referral_reward_triggers_on_first_trip_completion(): void
    {
        Notification::fake();

        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create([
            'role'                => 'driver',
            'referred_by_user_id' => $referrer->id,
        ]);
        DriverProfile::create([
            'user_id'       => $newDriver->id,
            'status'        => 'active',
            'trips_count'   => 0,
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-12345',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'White',
        ]);
        Wallet::firstOrCreate(['user_id' => $newDriver->id], ['points' => 500]);
        Wallet::firstOrCreate(['user_id' => $referrer->id],  ['points' => 0]);

        $customer = User::factory()->create(['role' => 'customer']);
        $booking  = Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $newDriver->id,
            'pickup'       => 'A', 'destination' => 'B',
            'date'         => now()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10,
            'price'        => 200000, 'discount' => 0, 'surcharge' => 0,
            'status'       => 'in_progress',
            'accepted_at'  => now()->subMinutes(30),
        ]);

        $this->actingAs($newDriver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(100, $referrer->wallet->fresh()->points);
        $this->assertNotNull($newDriver->fresh()->referral_rewarded_at);
    }

    public function test_customer_referral_vouchers_trigger_on_first_trip_completion(): void
    {
        Notification::fake();

        $referrerCustomer = User::factory()->create(['role' => 'customer']);
        $newCustomer      = User::factory()->create([
            'role'                => 'customer',
            'referred_by_user_id' => $referrerCustomer->id,
        ]);

        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id'       => $driver->id,
            'status'        => 'active',
            'trips_count'   => 5,
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-99999',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Black',
        ]);
        Wallet::firstOrCreate(['user_id' => $driver->id], ['points' => 500]);

        $booking = Booking::create([
            'customer_id'  => $newCustomer->id,
            'driver_id'    => $driver->id,
            'pickup'       => 'A', 'destination' => 'B',
            'date'         => now()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10,
            'price'        => 200000, 'discount' => 0, 'surcharge' => 0,
            'status'       => 'in_progress',
            'accepted_at'  => now()->subMinutes(30),
        ]);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/status", ['status' => 'completed'])
            ->assertOk();

        $this->assertEquals(2, Voucher::where('user_id', $referrerCustomer->id)->count());
        $this->assertEquals(4, Voucher::where('user_id', $newCustomer->id)->count());
    }

    public function test_driver_referral_reward_triggers_on_admin_approve_when_trip_already_done(): void
    {
        Notification::fake();

        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create([
            'role'                => 'driver',
            'referred_by_user_id' => $referrer->id,
        ]);
        // Driver has 1 trip done but was not yet active — reward not given yet
        DriverProfile::create([
            'user_id'       => $newDriver->id,
            'status'        => 'pending',
            'trips_count'   => 1,
            'vehicle_make'  => 'Honda',
            'vehicle_model' => 'City',
            'vehicle_plate' => '51G-77777',
            'vehicle_year'  => 2021,
            'vehicle_color' => 'Silver',
        ]);
        Wallet::firstOrCreate(['user_id' => $referrer->id],  ['points' => 0]);
        Wallet::firstOrCreate(['user_id' => $newDriver->id], ['points' => 0]);

        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/admin/drivers/{$newDriver->id}/approve")
            ->assertOk();

        $this->assertEquals(100, $referrer->wallet->fresh()->points);
    }
}
