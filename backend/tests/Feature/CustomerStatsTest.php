<?php

// backend/tests/Feature/CustomerStatsTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerStatsTest extends TestCase
{
    use RefreshDatabase;

    private function makeBooking(User $customer, string $status, string $date, array $money = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id' => $customer->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => $date,
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 0,
            'surcharge' => 0,
            'collection_fee' => 0,
            'status' => $status,
        ], $money));
    }

    public function test_totals_use_final_price_formula(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $today = now()->format('Y-m-d');

        // final_price = price - discount + surcharge + collection_fee
        $this->makeBooking($customer, 'completed', $today, [
            'price' => 500_000, 'discount' => 50_000, 'surcharge' => 20_000, 'collection_fee' => 30_000,
        ]);
        $this->makeBooking($customer, 'cancelled', $today, ['discount' => 10_000]);

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=month')
            ->assertOk();

        $res->assertJsonPath('completed', 1);
        $res->assertJsonPath('cancelled', 1);
        // 500.000 - 50.000 + 20.000 + 30.000 = 500.000
        $res->assertJsonPath('total_spent', 500_000);
        // giảm giá cộng trên MỌI chuyến trong kỳ, không chỉ chuyến hoàn thành
        $res->assertJsonPath('total_saved', 60_000);
    }

    public function test_only_counts_own_bookings(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $someone = User::factory()->create(['role' => 'customer']);
        $today = now()->format('Y-m-d');

        $this->makeBooking($me, 'completed', $today);
        $this->makeBooking($someone, 'completed', $today);

        $this->actingAs($me, 'sanctum')
            ->getJson('/api/customer/stats?period=month')
            ->assertOk()
            ->assertJsonPath('completed', 1)
            ->assertJsonPath('total_spent', 500_000);
    }

    public function test_week_period_returns_seven_points_including_empty_days(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($customer, 'completed', now()->format('Y-m-d'));

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=week')
            ->assertOk();

        // 7 mốc: hôm nay + 6 ngày trước, ngày không có chuyến vẫn phải có cột 0
        $res->assertJsonCount(7, 'points');
        $points = $res->json('points');
        $this->assertEquals(500_000, end($points)['value'], 'ngày hôm nay phải có doanh số');
        $this->assertEquals(0, $points[0]['value'], 'ngày không có chuyến phải là 0');
    }

    public function test_all_period_buckets_by_month_and_ignores_date_window_for_totals(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        // Chuyến rất cũ: KHÔNG nằm trong cửa sổ 6 tháng của biểu đồ,
        // nhưng PHẢI được tính vào tổng của period=all.
        $this->makeBooking($customer, 'completed', now()->subYears(2)->format('Y-m-d'));
        $this->makeBooking($customer, 'completed', now()->format('Y-m-d'));

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=all')
            ->assertOk();

        $res->assertJsonPath('completed', 2);
        $res->assertJsonPath('total_spent', 1_000_000);
        $res->assertJsonCount(6, 'points');
    }

    public function test_rejects_unknown_period(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=decade')
            ->assertStatus(422);
    }
}
