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
        return [$referrer, $newCustomer];
    }

    // ── Driver referral tests ─────────────────────────────────────────────────

    /** 50 điểm = 50.000đ (1 điểm = 1.000đ), cho MỖI bên. */
    public function test_driver_referral_credits_50_points_to_both(): void
    {
        [$referrer, $newDriver] = $this->makeDriverPair();

        $this->service->processDriverReferral($newDriver);

        $this->assertEquals(50, $referrer->wallet->fresh()->points);
        $this->assertEquals(50, $newDriver->wallet->fresh()->points);
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

        $this->assertEquals(50, $referrer->wallet->fresh()->points);
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

        $this->assertDatabaseHas('wallet_transactions', ['type' => 'referral', 'points' => 50]);
        $this->assertEquals(2, \App\Models\WalletTransaction::where('type', 'referral')->count());
    }

    // ── Customer referral tests ───────────────────────────────────────────────

    public function test_customer_referral_gives_referrer_one_100k_voucher(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $this->assertEquals(1, Voucher::where('user_id', $referrer->id)->count());
        $voucher = Voucher::where('user_id', $referrer->id)->first();
        $this->assertEquals('fixed', $voucher->type);
        $this->assertEquals(100000, $voucher->value);
        $this->assertEquals(1, $voucher->usage_limit);
        $this->assertTrue($voucher->is_active);
        $this->assertEquals(now()->addMonth()->format('Y-m-d'), $voucher->expires_at->format('Y-m-d'));
    }

    public function test_customer_referral_gives_nothing_extra_to_new_customer(): void
    {
        [$referrer, $newCustomer] = $this->makeCustomerPair();

        $this->service->processCustomerReferral($newCustomer);

        $this->assertEquals(0, Voucher::where('user_id', $newCustomer->id)->count());
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

        $this->assertEquals(1, Voucher::where('user_id', $referrer->id)->count());
    }

    public function test_customer_referral_skipped_when_no_referrer(): void
    {
        $customer = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => null]);

        $this->service->processCustomerReferral($customer);

        $this->assertEquals(0, Voucher::whereNotNull('user_id')->count());
    }
}
