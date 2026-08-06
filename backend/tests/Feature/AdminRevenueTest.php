<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminRevenueTest extends TestCase
{
    use RefreshDatabase;

    /**
     * RevenueController dùng DATE_FORMAT() — hàm chỉ có ở MySQL. Suite mặc định
     * chạy sqlite in-memory (xem phpunit.xml) nên endpoint này KHÔNG test được ở đó;
     * đó chính là lý do bug "ambiguous column" lọt lên tận production.
     *
     * Chạy bộ test này bằng MySQL:
     *   docker compose exec -T -e DB_CONNECTION=mysql -e DB_HOST=mysql \
     *     -e DB_DATABASE=green_car_airport_test app php artisan test --filter=AdminRevenueTest
     */
    protected function setUp(): void
    {
        parent::setUp();

        if (\DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('RevenueController cần MySQL (DATE_FORMAT) — bỏ qua trên sqlite.');
        }
    }

    private function makeCompletedBooking(User $customer, ?User $driver = null): Booking
    {
        return Booking::create([
            'customer_id'  => $customer->id,
            'driver_id'    => $driver?->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 500_000,
            'discount'     => 50_000,
            'surcharge'    => 0,
            'status'       => 'completed',
        ]);
    }

    /**
     * Hồi quy: query "Top tài xế" join bảng `users`, mà cả `bookings` và `users`
     * đều có cột `created_at` — không qualify tên bảng thì MySQL báo
     * "Column 'created_at' in where clause is ambiguous" và trang Doanh thu trả 500.
     */
    public function test_revenue_page_works_when_bookings_have_drivers(): void
    {
        $admin    = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver   = User::factory()->create(['role' => 'driver', 'name' => 'Tài Xế A']);

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
        $admin    = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver   = User::factory()->create(['role' => 'driver']);

        $this->makeCompletedBooking($customer, $driver);

        foreach (['today', 'week', 'month'] as $period) {
            $this->actingAs($admin)
                ->getJson("/api/admin/revenue?period={$period}")
                ->assertOk();
        }
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
