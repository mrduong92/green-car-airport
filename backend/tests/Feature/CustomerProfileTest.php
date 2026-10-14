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
}
