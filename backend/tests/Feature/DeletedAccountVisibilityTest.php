<?php

// backend/tests/Feature/DeletedAccountVisibilityTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\DriverProfile;
use App\Models\User;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeletedAccountVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function driver(): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $d->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-1',
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);

        return $d;
    }

    private function trip(User $customer, User $driver): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'driver_id' => $driver->id, 'pickup' => 'Hà Nội', 'destination' => 'Nội Bài',
            'date' => now()->subDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 300_000, 'discount' => 0, 'surcharge' => 0, 'status' => 'completed',
        ]);
    }

    public function test_tai_xe_xem_cuoc_cua_khach_da_xoa(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = $this->driver();
        $trip = $this->trip($customer, $driver);
        app(AccountDeletionService::class)->delete($customer);

        $this->actingAs($driver, 'sanctum')->getJson("/api/driver/trips/{$trip->id}")
            ->assertOk()
            ->assertJsonPath('customer_name', AccountDeletionService::DELETED_NAME)
            ->assertJsonPath('customer_phone', '')
            ->assertJsonPath('customer_phone_masked', '');
    }

    public function test_khach_xem_cuoc_cua_tai_xe_da_xoa(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = $this->driver();
        $trip = $this->trip($customer, $driver);
        app(AccountDeletionService::class)->delete($driver);

        $this->actingAs($customer, 'sanctum')->getJson("/api/bookings/{$trip->id}")
            ->assertOk()
            ->assertJsonPath('driver.name', AccountDeletionService::DELETED_NAME)
            ->assertJsonPath('driver.phone', null)
            ->assertJsonPath('driver.vehicle_plate', null);
    }

    public function test_admin_khong_thay_tai_khoan_da_xoa(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $gone = User::factory()->create(['role' => 'customer']);
        $kept = User::factory()->create(['role' => 'customer']);
        $goneDriver = $this->driver();
        app(AccountDeletionService::class)->delete($gone);
        app(AccountDeletionService::class)->delete($goneDriver);

        $customers = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/customers')->assertOk()->json());
        $drivers = collect($this->actingAs($admin, 'sanctum')->getJson('/api/admin/drivers')->assertOk()->json());

        $this->assertFalse($customers->pluck('id')->contains($gone->id));
        $this->assertTrue($customers->pluck('id')->contains($kept->id));
        $this->assertFalse($drivers->pluck('id')->contains($goneDriver->id));
    }
}
