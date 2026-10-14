<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AdminReferralReportTest extends TestCase
{
    use RefreshDatabase;

    private function trip(User $c, int $price, string $at, int $cashback = 0, int $commission = 0): void
    {
        $b = Booking::create([
            'customer_id' => $c->id, 'pickup' => 'A', 'destination' => 'B', 'date' => '2026-10-01', 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 10, 'price' => $price, 'discount' => 0, 'surcharge' => 0,
            'status' => 'completed', 'cashback_points' => $cashback, 'commission_points' => $commission,
        ]);
        Booking::whereKey($b->id)->update(['completed_at' => $at]);
    }

    public function test_top_referrers_monthly_and_detail(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $b = User::factory()->create(['role' => 'customer', 'name' => 'B']);
        $driver = User::factory()->create(['role' => 'driver']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-02']);
        $b1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $b->id, 'created_at' => '2026-09-02']);
        $d1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id, 'created_at' => '2026-10-03']);
        $this->trip($a1, 300_000, '2026-10-10 09:00:00', 15, 15);
        $this->trip($b1, 900_000, '2026-10-11 09:00:00', 45, 45);
        $this->trip($b1, 500_000, '2026-09-11 09:00:00', 25, 25);
        $this->trip($d1, 1_000_000, '2026-10-12 09:00:00', 50, 0);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?month=2026-10')->assertOk();

        $this->assertSame(['B', 'A'], collect($res->json('top'))->pluck('name')->all()); // tài xế không vào top
        $this->assertSame(900_000, $res->json('top.0.f1_revenue'));
        $oct = collect($res->json('monthly'))->firstWhere('month', '2026-10');
        $this->assertSame(1, $oct['f1_registered']);        // a1 (d1 do tài xế giới thiệu — không phải F1)
        $this->assertSame(1_200_000, $oct['f1_revenue']);   // a1 300k + b1 900k (d1 không tính)
        $this->assertSame(15 + 15 + 45 + 45 + 50, $oct['reward_points']);

        $detail = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$b->id}")->assertOk();
        $this->assertSame(2, $detail->json('f1.0.trips'));
        $this->assertSame(1_400_000, $detail->json('f1.0.spent'));

        $this->actingAs($a, 'sanctum')->getJson('/api/admin/referrals')->assertForbidden();
    }

    /**
     * Tháng hoàn thành phải bám `completed_at`, KHÔNG phải `updated_at`: một UPDATE
     * bất kỳ sau khi cuốc đã completed (vd AccountDeletionService xoá note của F1
     * đã xoá tài khoản) không được kéo cuốc cũ sang báo cáo tháng hiện tại.
     */
    public function test_month_attribution_survives_later_update_bumping_updated_at(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-02']);
        $this->trip($a1, 300_000, '2026-09-10 09:00:00', 15, 15);

        // Mô phỏng AccountDeletionService::delete(): update khác (không phải completed_at)
        // sau khi cuốc đã hoàn thành — Eloquent mass update tự đẩy updated_at sang "bây giờ".
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00'));
        Booking::where('customer_id', $a1->id)->update(['note' => null]);

        $sep = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?month=2026-09')->assertOk();
        $oct = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?month=2026-10')->assertOk();

        $this->assertSame(300_000, $sep->json('top.0.f1_revenue'));
        $this->assertSame(300_000, collect($sep->json('monthly'))->firstWhere('month', '2026-09')['f1_revenue']);
        $this->assertSame(0, collect($oct->json('monthly'))->firstWhere('month', '2026-10')['f1_revenue']);
    }

    /** Lọc theo tháng không được tràn sang tháng sau khi hôm nay là ngày 29-31 (Carbon::createFromFormat('Y-m', ...) giữ nguyên ngày trong tháng gốc). */
    public function test_month_filter_does_not_overflow_on_day_31(): void
    {
        $this->travelTo(Carbon::parse('2026-10-31 10:00:00'));

        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-05']);
        $this->trip($a1, 300_000, '2026-09-15 09:00:00', 15, 15);
        $this->trip($a1, 999_999, '2026-10-15 09:00:00', 10, 10); // tháng 10 — không được lẫn vào kết quả tháng 09

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?month=2026-09')->assertOk();

        $this->assertSame('2026-09', $res->json('month'));
        $this->assertSame(300_000, $res->json('top.0.f1_revenue'));
        $sep = collect($res->json('monthly'))->firstWhere('month', '2026-09');
        $this->assertSame(300_000, $sep['f1_revenue']);
        $this->assertSame(15 + 15, $sep['reward_points']);
    }
}
