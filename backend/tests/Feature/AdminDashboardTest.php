<?php

// backend/tests/Feature/AdminDashboardTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_app_fee_today_subtracts_points_used(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);

        // Cuốc cũ (charged_fee_points NULL): phí = appFeePoints − points_used =
        // 20% × (500.000 − 50.000) = 90 điểm − 40 điểm khách dùng = 50.000đ.
        Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 0, 'status' => 'completed', 'completed_at' => now(),
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard')->assertOk();

        $res->assertJsonPath('app_fee_today', 50_000);
        // Doanh thu cùng gốc với trang Doanh thu: giá − voucher.
        $res->assertJsonPath('revenue_today', 450_000);
    }

    /** Phí tài xế mất khi bỏ cuốc hôm nay (charged giữ lại + phần miễn thu thêm) tính vào phí app hôm nay. */
    public function test_app_fee_today_includes_driver_drop_forfeit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-12399',
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 1000]);
        $trip = Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id, 'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài', 'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 30, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0,
            'points_used' => 50, 'status' => 'finding_driver',
        ]);

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        $this->actingAs($driver, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/cancel", ['reason' => 'Bận'])->assertOk();

        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('trips_today', 0)
            ->assertJsonPath('revenue_today', 0)
            ->assertJsonPath('app_fee_today', 100_000);
    }

    public function test_app_fee_today_uses_fee_kept_and_completed_at(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $base = [
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'surcharge' => 0, 'status' => 'completed',
        ];
        // Tạo 3 ngày trước, hoàn thành hôm nay; nhận ở 20% (trừ 100 − 50 điểm = 50).
        $a = Booking::create($base + [
            'price' => 500_000, 'discount' => 0, 'points_used' => 50,
            'charged_fee_points' => 50, 'held_shortfall_points' => 0, 'completed_at' => now(),
        ]);
        Booking::whereKey($a->id)->update(['created_at' => now()->subDays(3)]);
        // Tạo hôm nay nhưng hoàn thành hôm qua — không tính hôm nay.
        Booking::create($base + [
            'price' => 900_000, 'discount' => 0, 'points_used' => 0,
            'charged_fee_points' => 180, 'held_shortfall_points' => 0, 'completed_at' => now()->subDay(),
        ]);

        AppSetting::set(AppSetting::APP_FEE_PERCENT, '10'); // đổi tỉ lệ sau khi nhận — không ảnh hưởng

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/dashboard')->assertOk();

        $res->assertJsonPath('trips_today', 1);
        $res->assertJsonPath('app_fee_today', 50_000);
    }
}
