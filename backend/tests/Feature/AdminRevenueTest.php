<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminRevenueTest extends TestCase
{
    use RefreshDatabase;

    /**
     * RevenueController chọn hàm định dạng ngày theo driver (DATE_FORMAT trên MySQL,
     * strftime trên sqlite) nên bộ test chạy được cả trên sqlite in-memory mặc định.
     * Nhánh MySQL (ONLY_FULL_GROUP_BY, cột ambiguous khi join users) vẫn nên chạy lại bằng:
     *   docker compose exec -T -e DB_CONNECTION=mysql -e DB_HOST=mysql \
     *     -e DB_DATABASE=green_car_airport_test app php artisan test --filter=AdminRevenueTest
     */
    private function makeCompletedBooking(User $customer, ?User $driver = null): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id,
            'driver_id' => $driver?->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 50_000,
            'surcharge' => 0,
            'status' => 'completed',
        ]);
    }

    /**
     * Hồi quy: query "Top tài xế" join bảng `users`, mà cả `bookings` và `users`
     * đều có cột `created_at` — không qualify tên bảng thì MySQL báo
     * "Column 'created_at' in where clause is ambiguous" và trang Doanh thu trả 500.
     */
    public function test_revenue_page_works_when_bookings_have_drivers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver', 'name' => 'Tài Xế A']);

        $this->makeCompletedBooking($customer, $driver);

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week');

        $res->assertOk();
        $res->assertJsonPath('trips_completed', 1);
        $res->assertJsonPath('total_revenue', 450_000);
        $res->assertJsonPath('top_drivers.0.name', 'Tài Xế A');
        $res->assertJsonPath('top_drivers.0.trips', 1);
        $res->assertJsonPath('top_drivers.0.revenue', 450_000);
    }

    public function test_revenue_page_works_for_every_period(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver']);

        $this->makeCompletedBooking($customer, $driver);

        foreach (['today', 'week', 'month'] as $period) {
            $this->actingAs($admin)
                ->getJson("/api/admin/revenue?period={$period}")
                ->assertOk();
        }
    }

    /**
     * Cuốc cũ (charged_fee_points NULL — nhận trước bản trừ-lúc-nhận): phí thực thu
     * = appFeePoints − points_used theo tỉ lệ hiện tại.
     */
    public function test_app_fee_subtracts_points_used(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver']);

        // effective = 500k - 50k = 450k → phí 20% = 90k. Khách dùng 40 điểm
        // (app bù 40.000đ) → phí thực thu = 90.000 - 40.000 = 50.000.
        Booking::create([
            'customer_id' => $customer->id, 'driver_id' => $driver->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 0, 'status' => 'completed',
        ]);

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week');

        $res->assertOk();
        $res->assertJsonPath('app_fee', 50_000);
        $res->assertJsonPath('chart.0.fee', 50_000);
    }

    /**
     * Phí app = phí THỰC giữ lại từng cuốc (charged_fee_points − held_shortfall_points),
     * không phải doanh thu × tỉ lệ HIỆN TẠI — admin đổi tỉ lệ sau khi cuốc đã nhận thì
     * báo cáo không được đổi theo. Lọc/gom theo ngày HOÀN THÀNH (completed_at).
     */
    public function test_app_fee_uses_fee_actually_kept_and_completed_at(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $base = [
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'surcharge' => 0, 'status' => 'completed',
        ];

        // A: nhận ở 20% (trừ 100 − 50 điểm = 50), tạo 20 ngày trước nhưng HOÀN THÀNH hôm nay.
        $a = Booking::create($base + [
            'price' => 500_000, 'discount' => 0, 'points_used' => 50,
            'charged_fee_points' => 50, 'held_shortfall_points' => 0, 'completed_at' => now(),
        ]);
        Booking::whereKey($a->id)->update(['created_at' => now()->subDays(20)]);
        // B: cuốc cũ (charged NULL, completed_at NULL → dùng created_at) — 10% × 450k = 45k.
        Booking::create($base + ['price' => 500_000, 'discount' => 50_000, 'points_used' => 0]);
        // C: phí bị clamp 0, app bù 25 điểm cho tài xế → app MẤT 25k.
        Booking::create($base + [
            'price' => 500_000, 'discount' => 0, 'points_used' => 50,
            'charged_fee_points' => 0, 'held_shortfall_points' => 25, 'completed_at' => now(),
        ]);
        // D: tạo hôm nay nhưng hoàn thành 20 ngày trước — không thuộc tuần này.
        Booking::create($base + [
            'price' => 900_000, 'discount' => 0, 'points_used' => 0,
            'charged_fee_points' => 180, 'held_shortfall_points' => 0, 'completed_at' => now()->subDays(20),
        ]);

        AppSetting::set(AppSetting::APP_FEE_PERCENT, '10'); // admin hạ tỉ lệ SAU khi A, C đã nhận

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk();

        $res->assertJsonPath('trips_completed', 3);
        $res->assertJsonPath('total_revenue', 1_450_000);
        $res->assertJsonPath('app_fee', 50_000 + 45_000 - 25_000);
        $res->assertJsonPath('chart.0.label', now()->format('d/m'));
        $res->assertJsonPath('chart.0.fee', 70_000);
    }

    public function test_revenue_page_works_with_no_data(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)->getJson('/api/admin/revenue')
            ->assertOk()
            ->assertJsonPath('total_revenue', 0)
            ->assertJsonPath('trips_completed', 0)
            ->assertJsonPath('top_drivers', []);
    }
}
