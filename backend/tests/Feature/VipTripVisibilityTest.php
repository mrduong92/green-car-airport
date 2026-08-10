<?php

// backend/tests/Feature/VipTripVisibilityTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Support\AvailableTripsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VipTripVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Cùng lý do warm-up như AvailableTripsListTest: flush() ĐẦU TIÊN trên
        // key chưa tồn tại là no-op (Cache::increment khởi tạo bằng chính giá
        // trị tăng, trùng với version() mặc định là 1) — không liên quan tới
        // VIP, chỉ để test không dính quirk đó.
        AvailableTripsCache::flush();
    }

    private function makeDriver(bool $isVip, string $vehicleType = 'sedan_4'): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => $vehicleType,
            'is_vip' => $isVip,
            'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 1000]);

        return $driver;
    }

    private function makeBooking(bool $isVip, string $vehicleType = 'sedan_4'): Booking
    {
        $customer = User::factory()->create(['role' => 'customer']);

        return Booking::create([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => $vehicleType,
            'is_vip' => $isVip,
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
    }

    /**
     * Bài test quan trọng nhất của Task 4: tài xế VIP gọi TRƯỚC để nạp cache,
     * rồi tài xế thường gọi sau. Nếu hai bên dùng chung entry cache thì tài xế
     * thường sẽ thấy cuốc VIP dù bộ lọc SQL viết đúng.
     */
    public function test_normal_driver_does_not_read_vip_entry_from_cache(): void
    {
        $vipBooking = $this->makeBooking(true);
        $plainBooking = $this->makeBooking(false);

        $vipDriver = $this->makeDriver(true);
        $vipIds = collect($this->actingAs($vipDriver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->sort()->values()->all();
        $this->assertEquals(
            collect([$vipBooking->id, $plainBooking->id])->sort()->values()->all(),
            $vipIds,
            'tài xế VIP phải thấy cả cuốc VIP lẫn cuốc thường',
        );

        // KHÔNG flush cache — đó chính là điều kiện tái hiện lỗi
        $plainDriver = $this->makeDriver(false);
        $plainIds = collect($this->actingAs($plainDriver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->all();

        $this->assertEquals([$plainBooking->id], $plainIds);
    }

    public function test_cache_flush_still_works(): void
    {
        $this->makeBooking(false);
        $driver = $this->makeDriver(false);

        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')->assertOk();

        $fresh = $this->makeBooking(false);
        AvailableTripsCache::flush();

        $ids = collect($this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips')->assertOk()->json())->pluck('id')->all();

        $this->assertContains($fresh->id, $ids);
    }
}
