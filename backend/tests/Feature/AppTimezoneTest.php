<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Khách nhập ngày/giờ đón theo giờ Việt Nam. Khi app chạy UTC (chậm 7 tiếng),
 * kiểm tra "giờ đón phải cách ít nhất 30 phút" so lệch: 10h sáng VN vẫn đặt được
 * cuốc 8h cùng ngày, và từ 0h–7h sáng VN thì kiểm tra bị bỏ qua hẳn (ngày UTC
 * vẫn là hôm qua).
 */
class AppTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function bookAt(string $vnNow, string $date, string $time)
    {
        // Khoảnh khắc $vnNow, biểu diễn theo múi giờ app ĐANG cấu hình — giống hệt
        // now() ngoài production. Carbon giữ múi giờ của test now (không đổi về múi
        // giờ app), nên truyền thẳng bản giờ VN sẽ che mất lỗi cấu hình.
        Carbon::setTestNow(Carbon::parse($vnNow, 'Asia/Ho_Chi_Minh')->setTimezone(config('app.timezone')));

        return $this->actingAs(User::factory()->create(['role' => 'customer']), 'sanctum')
            ->postJson('/api/bookings', [
                'pickup' => 'Hà Nội',
                'destination' => 'Sân bay Nội Bài',
                'date' => $date,
                'time' => $time,
                'vehicle_type' => 'sedan_4',
                'distance_km' => 30,
                'price' => 250_000,
            ]);
    }

    public function test_app_runs_on_vietnam_time(): void
    {
        $this->assertSame('Asia/Ho_Chi_Minh', config('app.timezone'));
    }

    public function test_pickup_time_already_passed_today_is_rejected(): void
    {
        $this->bookAt('2026-10-11 10:00', '2026-10-11', '08:00')->assertStatus(422);
    }

    public function test_pickup_within_30_minutes_early_morning_is_rejected(): void
    {
        // 6h sáng VN = 23h hôm trước theo UTC — trước đây so sai ngày nên lọt qua.
        $this->bookAt('2026-10-11 06:00', '2026-10-11', '06:10')->assertStatus(422);
    }

    public function test_pickup_later_today_is_accepted(): void
    {
        $this->bookAt('2026-10-11 10:00', '2026-10-11', '11:00')->assertCreated();
    }
}
