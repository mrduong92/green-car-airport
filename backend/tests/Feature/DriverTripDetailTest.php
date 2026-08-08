<?php

// backend/tests/Feature/DriverTripDetailTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Xem chi tiết MỘT cuốc của tài xế, không phụ thuộc trạng thái.
 *
 * Bug production 2026-08-09: tab Lịch sử liệt kê cuốc `completed` (lấy từ
 * /driver/trips/history) nhưng trang chi tiết lại tra cứu trong /driver/trips/mine
 * — endpoint chỉ trả cuốc đang chạy. Kết quả: bấm vào BẤT KỲ cuốc nào trong Lịch
 * sử đều ra "Không tìm thấy cuốc xe này".
 *
 * Gốc rễ là trang chi tiết đi quét DANH SÁCH thay vì lấy theo ID. Cuốc bị khách
 * huỷ cũng dính lỗi tương tự vì không nằm trong danh sách nào.
 */
class DriverTripDetailTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);

        return $driver;
    }

    private function makeBooking(string $status, ?int $driverId): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'driver_id' => $driverId,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => $status,
        ]);
    }

    public function test_xem_duoc_cuoc_da_hoan_thanh(): void
    {
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('completed', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('id', $booking->id)
            ->assertJsonPath('status', 'completed');
    }

    public function test_xem_duoc_cuoc_dang_chay(): void
    {
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('in_progress', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('id', $booking->id);
    }

    public function test_xem_duoc_cuoc_da_huy(): void
    {
        // Khách huỷ khi tài xế đã nhận: cuốc không nằm trong mine lẫn history,
        // nhưng tài xế vẫn phải mở được để biết chuyện gì đã xảy ra.
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('cancelled', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('status', 'cancelled');
    }

    public function test_khong_xem_duoc_cuoc_cua_tai_xe_khac(): void
    {
        $toi = $this->makeDriver();
        $nguoiKhac = $this->makeDriver();
        $booking = $this->makeBooking('completed', $nguoiKhac->id);

        $this->actingAs($toi, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertForbidden();
    }

    public function test_khong_xem_duoc_cuoc_chua_ai_nhan(): void
    {
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('finding_driver', null);

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertForbidden();
    }

    public function test_route_mine_va_history_khong_bi_nuot_boi_route_moi(): void
    {
        // `/driver/trips/{booking}` đăng ký sau `/mine` và `/history`; nếu đảo thứ
        // tự thì Laravel sẽ khớp "mine" thành {booking} và cả hai màn hình cùng vỡ.
        $driver = $this->makeDriver();

        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips/mine')->assertOk();
        $this->actingAs($driver, 'sanctum')->getJson('/api/driver/trips/history')->assertOk();
    }
}
