<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Support\AvailableTripsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Admin sửa loại xe / loại biển cho tài xế khai sai lúc đăng ký hoặc đã đổi xe. */
class AdminDriverVehicleTypeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AvailableTripsCache::flush();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function driver(string $vehicleType, bool $isVip = false): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Innova',
            'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Bạc',
            'vehicle_type' => $vehicleType,
            'is_vip' => $isVip,
            'status' => 'active',
        ]);

        return $driver;
    }

    private function waitingBooking(string $vehicleType): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => $vehicleType,
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => 'finding_driver',
        ]);
    }

    public function test_admin_can_change_vehicle_type(): void
    {
        $driver = $this->driver('suv_5');

        $this->actingAs($this->admin(), 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['vehicle_type' => 'mpv_7'])
            ->assertOk()
            ->assertJsonPath('vehicle_type', 'mpv_7');

        $this->assertDatabaseHas('driver_profiles', ['user_id' => $driver->id, 'vehicle_type' => 'mpv_7']);
    }

    public function test_invalid_vehicle_type_is_rejected(): void
    {
        $driver = $this->driver('suv_5');

        $this->actingAs($this->admin(), 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['vehicle_type' => 'bus_16'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('vehicle_type');

        $this->assertDatabaseHas('driver_profiles', ['user_id' => $driver->id, 'vehicle_type' => 'suv_5']);
    }

    public function test_admin_can_switch_white_plate_driver_to_yellow_plate(): void
    {
        $driver = $this->driver('sedan_4', isVip: true);

        $this->actingAs($this->admin(), 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['is_vip' => false])
            ->assertOk()
            ->assertJsonPath('is_vip', false);
    }

    public function test_change_takes_effect_on_driver_trip_list_immediately(): void
    {
        $driver = $this->driver('mpv_7');
        $sevenSeat = $this->waitingBooking('mpv_7');

        // Tài xế mở danh sách khi còn là xe 7 → thấy cuốc 7 chỗ (và cache được ghi).
        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonFragment(['id' => $sevenSeat->id]);

        $this->actingAs($this->admin(), 'sanctum')
            ->putJson("/api/admin/drivers/{$driver->id}", ['vehicle_type' => 'sedan_4'])
            ->assertOk();

        $ids = collect($this->actingAs($driver->fresh(), 'sanctum')->getJson('/api/driver/trips')->json())
            ->pluck('id');
        $this->assertNotContains($sevenSeat->id, $ids);
    }
}
