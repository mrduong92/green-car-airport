<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Voucher;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingUsePointsTest extends TestCase
{
    use RefreshDatabase;

    private function customer(int $reward): User
    {
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => $reward]);

        return $c;
    }

    private function payload(array $over = []): array
    {
        return array_merge([
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài', 'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30, 'price' => 500_000,
        ], $over);
    }

    private function reward(User $u): int
    {
        return (int) Wallet::where('user_id', $u->id)->value('reward_points');
    }

    public function test_use_points_caps_at_10_percent_of_price_after_voucher(): void
    {
        $c = $this->customer(1000);
        Voucher::create(['code' => 'V50', 'type' => 'fixed', 'value' => 50_000, 'is_active' => true, 'expires_at' => now()->addDays(5), 'usage_count' => 0]);

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['voucher_code' => 'V50', 'use_points' => true]))
            ->assertCreated()
            ->assertJson(['discount' => 50_000, 'points_used' => 45, 'points_discount' => 45_000, 'final_price' => 405_000]);

        $this->assertSame(955, $this->reward($c));
    }

    public function test_without_use_points_nothing_is_spent(): void
    {
        $c = $this->customer(1000);

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload())
            ->assertCreated()->assertJson(['points_used' => 0, 'final_price' => 500_000]);

        $this->assertSame(1000, $this->reward($c));
    }

    public function test_use_points_with_zero_balance_books_normally(): void
    {
        $c = User::factory()->create(['role' => 'customer']); // chưa có ví

        $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))
            ->assertCreated()->assertJson(['points_used' => 0]);
    }

    public function test_customer_cancel_refunds_points_once(): void
    {
        $c = $this->customer(1000);
        $id = $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))->json('id');

        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$id}/cancel")->assertOk();
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$id}/cancel")->assertStatus(422);

        $this->assertSame(1000, $this->reward($c));
        $this->assertNotNull(Booking::find($id)->points_refunded_at);

        // Điểm đã hoàn thì không còn hiển thị như đang giảm giá cuốc đã huỷ nữa —
        // cột points_used trong DB vẫn giữ nguyên (lịch sử), chỉ số hiển thị đổi.
        $this->actingAs($c, 'sanctum')->getJson("/api/bookings/{$id}")
            ->assertOk()
            ->assertJson(['points_used' => 0, 'points_discount' => 0, 'final_price' => 500_000]);
        $this->assertSame(50, Booking::find($id)->points_used);
    }

    public function test_stale_booking_expiry_refunds_points(): void
    {
        $c = $this->customer(1000);
        $id = $this->actingAs($c, 'sanctum')->postJson('/api/bookings', $this->payload(['use_points' => true]))->json('id');
        Booking::whereKey($id)->update(['created_at' => now()->subHours(25)]);

        // Lệnh thật tên là `bookings:expire` (xem app/Console/Commands/ExpireStaleBookings.php),
        // brief gốc ghi `bookings:expire-stale` — sửa theo lệnh thật, không đổi lệnh.
        $this->artisan('bookings:expire')->assertSuccessful();

        $this->assertSame('cancelled', Booking::find($id)->status);
        $this->assertSame(1000, $this->reward($c));
    }
}
