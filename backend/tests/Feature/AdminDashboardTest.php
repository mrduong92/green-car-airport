<?php

// backend/tests/Feature/AdminDashboardTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * DashboardController, khác RevenueController, không dùng DATE_FORMAT nên chạy
 * được trên sqlite — đặt test điểm trừ phí app ở đây (AdminRevenueTest bị skip
 * toàn bộ trên sqlite vì cần MySQL).
 */
class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_app_fee_today_subtracts_points_used(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);

        // revenue_today (DashboardController) dùng `price` thô (chưa trừ discount) →
        // phí 20% × 500.000 = 100.000. Khách dùng 40 điểm (app bù 40.000đ) →
        // phí thực thu = 100.000 - 40.000 = 60.000.
        Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 0, 'status' => 'completed',
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard')->assertOk();

        $res->assertJsonPath('app_fee_today', 60_000);
    }
}
