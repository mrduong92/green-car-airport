<?php

// backend/tests/Feature/BookingHistoryPaginationTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingHistoryPaginationTest extends TestCase
{
    use RefreshDatabase;

    private const PER_PAGE = 20;

    private function seedBookings(User $customer, int $count, string $status = 'completed'): void
    {
        for ($i = 0; $i < $count; $i++) {
            Booking::create([
                'customer_id' => $customer->id,
                'pickup' => "Điểm đón $i",
                'destination' => 'Sân bay Nội Bài',
                'date' => now()->subDays($i)->format('Y-m-d'),
                'time' => '08:00',
                'vehicle_type' => 'sedan_4',
                'distance_km' => 30,
                'price' => 500_000,
                'discount' => 0,
                'surcharge' => 0,
                'status' => $status,
            ]);
        }
    }

    public function test_first_page_is_capped_and_exposes_cursor(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->seedBookings($customer, 25);

        $res = $this->actingAs($customer, 'sanctum')->getJson('/api/bookings')->assertOk();

        $res->assertJsonCount(self::PER_PAGE, 'data');
        $this->assertNotNull($res->json('next_cursor'), 'còn dữ liệu thì phải có cursor');
    }

    public function test_cursor_returns_remaining_records_without_overlap(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->seedBookings($customer, 25);

        $first = $this->actingAs($customer, 'sanctum')->getJson('/api/bookings')->assertOk();
        $cursor = $first->json('next_cursor');

        $second = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/bookings?cursor='.urlencode($cursor))
            ->assertOk();

        $second->assertJsonCount(5, 'data');
        $this->assertNull($second->json('next_cursor'), 'hết dữ liệu thì cursor phải null');

        // Không được lặp bản ghi giữa 2 trang — đây chính là lý do dùng cursor
        // thay vì offset khi dữ liệu sắp theo thời gian và luôn có bản ghi mới.
        $idsPage1 = collect($first->json('data'))->pluck('id')->all();
        $idsPage2 = collect($second->json('data'))->pluck('id')->all();
        $this->assertEmpty(array_intersect($idsPage1, $idsPage2));
        $this->assertCount(25, array_unique(array_merge($idsPage1, $idsPage2)));
    }

    public function test_status_filter_still_applies_across_pages(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->seedBookings($customer, 22, 'completed');
        $this->seedBookings($customer, 5, 'cancelled');

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/bookings?status=cancelled')
            ->assertOk();

        $res->assertJsonCount(5, 'data');
        $this->assertNull($res->json('next_cursor'));
        foreach ($res->json('data') as $booking) {
            $this->assertEquals('cancelled', $booking['status']);
        }
    }

    public function test_only_returns_own_bookings(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $someone = User::factory()->create(['role' => 'customer']);
        $this->seedBookings($me, 3);
        $this->seedBookings($someone, 4);

        $this->actingAs($me, 'sanctum')->getJson('/api/bookings')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }
}
