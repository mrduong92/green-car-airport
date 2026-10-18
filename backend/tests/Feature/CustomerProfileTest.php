<?php

// backend/tests/Feature/CustomerProfileTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_total_spent_subtracts_points_used_like_stats_controller(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 0, 'status' => 'completed',
        ]);

        $res = $this->actingAs($customer, 'sanctum')->getJson('/api/customer/profile')->assertOk();

        // 500.000 - 50.000 - 40*1.000 = 410.000 — khớp StatsController::total_spent
        $res->assertJsonPath('total_spent', 410_000);
        $res->assertJsonPath('completed', 1);
    }

    public function test_profile_total_spent_matches_stats_total_spent(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $base = [
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
        ];
        // Có phụ phí phạt + thu hộ + điểm chưa hoàn: 500k − 50k − 40k + 30k + 20k = 460k
        Booking::create($base + [
            'price' => 500_000, 'discount' => 50_000, 'points_used' => 40, 'surcharge' => 30_000,
            'collection_fee' => 20_000, 'status' => 'completed',
        ]);
        // Điểm đã hoàn (points_refunded_at) → không trừ: 300k
        Booking::create($base + [
            'price' => 300_000, 'discount' => 0, 'points_used' => 25, 'surcharge' => 0,
            'status' => 'completed', 'points_refunded_at' => now(),
        ]);
        // Cuốc huỷ không tính
        Booking::create($base + [
            'price' => 900_000, 'discount' => 0, 'points_used' => 0, 'surcharge' => 0, 'status' => 'cancelled',
        ]);

        $profile = $this->actingAs($customer, 'sanctum')->getJson('/api/customer/profile')->assertOk();
        $stats = $this->actingAs($customer, 'sanctum')->getJson('/api/customer/stats?period=all')->assertOk();

        $this->assertSame(760_000, $profile->json('total_spent'));
        $this->assertSame($stats->json('total_spent'), $profile->json('total_spent'));
    }
}
