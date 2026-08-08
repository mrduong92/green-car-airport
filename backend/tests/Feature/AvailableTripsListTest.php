<?php
// backend/tests/Feature/AvailableTripsListTest.php

namespace Tests\Feature;

use App\Http\Controllers\Driver\TripController;
use App\Models\Booking;
use App\Models\User;
use App\Support\AvailableTripsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * ⚠️ Giới hạn của bộ test này: phpunit.xml đặt CACHE_STORE=array, mà driver
 * `array` KHÔNG serialize giá trị. Nghĩa là mọi lỗi kiểu "cache được Eloquent
 * model rồi unserialize hỏng" (__PHP_Incomplete_Class trên Redis) sẽ luôn xanh
 * ở đây. Đã dính đúng bug đó khi phát triển — chỉ lộ ra khi gọi thật qua Redis.
 * Sau khi đổi logic cache, phải kiểm tay bằng 2 request liên tiếp trên môi
 * trường dùng Redis.
 */
class AvailableTripsListTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        AvailableTripsCache::flush();
    }

    private function makeDriver(?string $vehicleType): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make'  => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year'  => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type'  => $vehicleType,
            'status'        => 'active',
        ]);

        return $driver;
    }

    private function makeWaitingBooking(?string $vehicleType): Booking
    {
        return Booking::create([
            'customer_id'  => User::factory()->create(['role' => 'customer'])->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => $vehicleType,
            'distance_km'  => 30,
            'price'        => 500_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ]);
    }

    public function test_driver_only_sees_trips_their_vehicle_can_take(): void
    {
        $driver = $this->makeDriver('sedan_4');
        $this->makeWaitingBooking('sedan_4');
        $this->makeWaitingBooking('mpv_7');   // xe 7 chỗ — xe 4 chỗ không chở được

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')->assertOk();

        $this->assertCount(1, $res->json());
        $this->assertEquals('sedan_4', Booking::find($res->json('0.id'))->vehicle_type);
    }

    public function test_bigger_vehicle_sees_smaller_trips_too(): void
    {
        $driver = $this->makeDriver('mpv_7');
        $this->makeWaitingBooking('sedan_4');
        $this->makeWaitingBooking('mpv_7');

        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()
            ->assertJsonCount(2);
    }

    /**
     * Bộ lọc đã chuyển từ PHP (`fitsDriverVehicle`) xuống SQL (`whereIn`). Hai
     * đường phải cho CÙNG kết quả ở mọi tổ hợp, nếu không là âm thầm giấu cuốc
     * khỏi tài xế — lỗi không ai phát hiện cho tới khi tài xế phàn nàn.
     *
     * `accept()` vẫn dùng fitsDriverVehicle() để chặn, nên hai bên lệch nhau sẽ
     * thành: cuốc hiện trong danh sách nhưng bấm nhận thì bị từ chối.
     */
    public function test_sql_filter_matches_php_filter_for_every_combination(): void
    {
        $types = ['sedan_4', 'suv_5', 'mpv_7'];
        foreach ($types as $t) {
            $this->makeWaitingBooking($t);
        }

        foreach ($types as $driverType) {
            $driver = $this->makeDriver($driverType);
            AvailableTripsCache::flush();

            $returned = collect($this->actingAs($driver, 'sanctum')
                ->getJson('/api/driver/trips')->assertOk()->json())
                ->map(fn ($t) => Booking::find($t['id'])->vehicle_type)
                ->sort()->values()->all();

            $expected = collect($types)
                ->filter(fn ($bookingType) => $this->phpFilterAllows($bookingType, $driverType))
                ->sort()->values()->all();

            $this->assertEquals($expected, $returned, "lệch ở tài xế xe $driverType");
        }
    }

    /** Bản sao ngữ nghĩa của TripController::fitsDriverVehicle() để đối chiếu. */
    private function phpFilterAllows(string $bookingType, string $driverType): bool
    {
        $rank = ['sedan_4' => 4, 'suv_5' => 5, 'mpv_7' => 7];

        return $rank[$bookingType] <= $rank[$driverType];
    }

    public function test_list_is_capped(): void
    {
        $driver = $this->makeDriver('mpv_7');
        for ($i = 0; $i < 55; $i++) {
            $this->makeWaitingBooking('sedan_4');
        }

        $res = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')->assertOk();

        $this->assertLessThanOrEqual(50, count($res->json()), 'danh sách phải bị chặn trần');
    }

    public function test_new_booking_shows_up_immediately_despite_cache(): void
    {
        Notification::fake();
        $driver   = $this->makeDriver('sedan_4');
        $customer = User::factory()->create(['role' => 'customer']);

        // Nạp cache với danh sách rỗng
        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()->assertJsonCount(0);

        // Khách đặt cuốc — store() phải flush cache
        $this->actingAs($customer, 'sanctum')->postJson('/api/bookings', [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 500_000,
        ])->assertSuccessful();

        // Không chờ TTL: tài xế phải thấy ngay, nếu không thì nhận được thông
        // báo "có cuốc mới" mà mở app ra danh sách vẫn trống.
        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()->assertJsonCount(1);
    }

    public function test_accepted_trip_leaves_the_list_immediately(): void
    {
        Notification::fake();
        $driver = $this->makeDriver('sedan_4');
        $driver->wallet()->create(['points' => 10_000]);
        $booking = $this->makeWaitingBooking('sedan_4');

        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()->assertJsonCount(1);

        $this->actingAs($driver, 'sanctum')
            ->postJson("/api/driver/trips/{$booking->id}/accept")->assertOk();

        // Tài xế khác không được thấy cuốc đã bị nhận
        $other = $this->makeDriver('sedan_4');
        $this->actingAs($other, 'sanctum')->getJson('/api/driver/trips')
            ->assertOk()->assertJsonCount(0);
    }

    public function test_cap_constant_matches_documented_limit(): void
    {
        $this->assertEquals(5, TripController::MAX_ACTIVE_TRIPS);
    }
}
