<?php
// backend/tests/Feature/ReferralServiceTest.php
namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReferralServiceTest extends TestCase
{
    use RefreshDatabase;

    private ReferralService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(ReferralService::class);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function driverProfileData(array $overrides = []): array
    {
        return array_merge([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => 'TEST-00',
            'vehicle_year'  => 2020,
            'vehicle_color' => 'White',
        ], $overrides);
    }

    private function makeDriverPair(): array
    {
        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create([
            'role'                => 'driver',
            'referred_by_user_id' => $referrer->id,
            'referral_rewarded_at'=> null,
        ]);
        DriverProfile::create($this->driverProfileData([
            'user_id' => $newDriver->id, 'status' => 'active', 'trips_count' => 1,
            'vehicle_plate' => 'TEST-01',
        ]));
        Wallet::firstOrCreate(['user_id' => $referrer->id],  ['points' => 0]);
        Wallet::firstOrCreate(['user_id' => $newDriver->id], ['points' => 0]);
        return [$referrer, $newDriver];
    }

    private function makeCustomerPair(): array
    {
        $referrer    = User::factory()->create(['role' => 'customer']);
        $newCustomer = User::factory()->create([
            'role'                => 'customer',
            'referred_by_user_id' => $referrer->id,
            'referral_rewarded_at'=> null,
        ]);
        Booking::create([
            'customer_id'  => $newCustomer->id,
            'pickup'       => 'A', 'destination' => 'B',
            'date'         => now()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10,
            'price' => 200000, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed',
        ]);
        return [$referrer, $newCustomer];
    }

    // ── Driver referral tests ─────────────────────────────────────────────────

    public function test_driver_referral_credits_100_points_to_both(): void
    {
        [$referrer, $newDriver] = $this->makeDriverPair();

        $this->service->processDriverReferral($newDriver);

        $this->assertEquals(100, $referrer->wallet->fresh()->points);
        $this->assertEquals(100, $newDriver->wallet->fresh()->points);
    }

    public function test_driver_referral_sets_referral_rewarded_at(): void
    {
        [$referrer, $newDriver] = $this->makeDriverPair();

        $this->service->processDriverReferral($newDriver);

        $this->assertNotNull($newDriver->fresh()->referral_rewarded_at);
    }

    public function test_driver_referral_is_idempotent(): void
    {
        [$referrer, $newDriver] = $this->makeDriverPair();

        $this->service->processDriverReferral($newDriver);
        $this->service->processDriverReferral($newDriver->fresh());

        $this->assertEquals(100, $referrer->wallet->fresh()->points);
    }

    public function test_driver_referral_skipped_when_no_referrer(): void
    {
        $driver = User::factory()->create(['role' => 'driver', 'referred_by_user_id' => null]);
        DriverProfile::create($this->driverProfileData([
            'user_id' => $driver->id, 'status' => 'active', 'trips_count' => 1,
        ]));

        $this->service->processDriverReferral($driver);

        $this->assertNull(Wallet::where('user_id', $driver->id)->first());
    }

    public function test_driver_referral_skipped_when_referrer_is_not_driver(): void
    {
        $customerReferrer = User::factory()->create(['role' => 'customer']);
        $newDriver = User::factory()->create([
            'role' => 'driver', 'referred_by_user_id' => $customerReferrer->id,
        ]);
        DriverProfile::create($this->driverProfileData([
            'user_id' => $newDriver->id, 'status' => 'active', 'trips_count' => 1,
        ]));

        $this->service->processDriverReferral($newDriver);

        $this->assertNull(Wallet::where('user_id', $customerReferrer->id)->first());
    }

    public function test_driver_referral_skipped_when_driver_not_active(): void
    {
        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create(['role' => 'driver', 'referred_by_user_id' => $referrer->id]);
        DriverProfile::create($this->driverProfileData([
            'user_id' => $newDriver->id, 'status' => 'pending', 'trips_count' => 1,
        ]));

        $this->service->processDriverReferral($newDriver);

        $this->assertNull(Wallet::where('user_id', $referrer->id)->first());
    }

    public function test_driver_referral_skipped_when_no_completed_trips(): void
    {
        $referrer  = User::factory()->create(['role' => 'driver']);
        $newDriver = User::factory()->create(['role' => 'driver', 'referred_by_user_id' => $referrer->id]);
        DriverProfile::create($this->driverProfileData([
            'user_id' => $newDriver->id, 'status' => 'active', 'trips_count' => 0,
        ]));

        $this->service->processDriverReferral($newDriver);

        $this->assertNull(Wallet::where('user_id', $referrer->id)->first());
    }

    public function test_driver_referral_creates_referral_type_transactions(): void
    {
        [$referrer, $newDriver] = $this->makeDriverPair();

        $this->service->processDriverReferral($newDriver);

        $this->assertDatabaseHas('wallet_transactions', ['type' => 'referral', 'points' => 100]);
        $this->assertEquals(2, \App\Models\WalletTransaction::where('type', 'referral')->count());
    }

    // ── Customer referral tests ───────────────────────────────────────────────

    public function test_customer_referral_creates_2_vouchers_for_referrer(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $this->assertEquals(2, Voucher::where('user_id', $referrer->id)->count());
    }

    public function test_customer_referral_creates_4_vouchers_for_new_customer(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $this->assertEquals(4, Voucher::where('user_id', $newCustomer->id)->count());
    }

    public function test_customer_referral_vouchers_are_50k_fixed_with_usage_limit_1(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $voucher = Voucher::where('user_id', $newCustomer->id)->first();
        $this->assertEquals('fixed', $voucher->type);
        $this->assertEquals(50000, $voucher->value);
        $this->assertEquals(1, $voucher->usage_limit);
        $this->assertTrue($voucher->is_active);
    }

    public function test_customer_referral_vouchers_expire_in_one_month(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $voucher = Voucher::where('user_id', $newCustomer->id)->first();
        $this->assertEquals(now()->addMonth()->format('Y-m-d'), $voucher->expires_at->format('Y-m-d'));
    }

    public function test_customer_referral_sets_referral_rewarded_at(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $this->assertNotNull($newCustomer->fresh()->referral_rewarded_at);
    }

    public function test_customer_referral_is_idempotent(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);
        $this->service->processCustomerReferral($newCustomer->fresh());

        $this->assertEquals(2, Voucher::where('user_id', $referrer->id)->count());
    }

    public function test_customer_referral_skipped_when_no_referrer(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => null]);
        Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'A', 'destination' => 'B',
            'date' => now()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10,
            'price' => 200000, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed',
        ]);

        $this->service->processCustomerReferral($customer);

        $this->assertEquals(0, Voucher::whereNotNull('user_id')->count());
    }

    public function test_customer_referral_skipped_when_not_first_completed_trip(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();
        // Add a second completed booking — now count = 2, reward should not trigger
        Booking::create([
            'customer_id' => $newCustomer->id,
            'pickup' => 'C', 'destination' => 'D',
            'date' => now()->format('Y-m-d'), 'time' => '09:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 5,
            'price' => 100000, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed',
        ]);

        $this->service->processCustomerReferral($newCustomer);

        $this->assertEquals(0, Voucher::whereNotNull('user_id')->count());
    }
}
