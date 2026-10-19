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

    public function test_top_referrers_in_range_and_detail(): void
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

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-31&group=day')
            ->assertOk();

        $this->assertSame('2026-10-01', $res->json('from'));
        $this->assertSame('2026-10-31', $res->json('to'));
        $this->assertSame('day', $res->json('group'));
        // tài xế không vào top, chỉ tính doanh số trong khoảng lọc
        $this->assertSame(['B', 'A'], collect($res->json('top'))->pluck('name')->all());
        $this->assertSame(900_000, $res->json('top.0.f1_revenue'));

        $this->assertSame(1, $res->json('summary.f1_registered'));        // a1 (d1 do tài xế giới thiệu — không phải F1)
        $this->assertSame(1_200_000, $res->json('summary.f1_revenue'));   // a1 300k + b1 900k (d1 không tính)
        $this->assertSame(15 + 15 + 45 + 45 + 50, $res->json('summary.reward_points'));

        $detail = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$b->id}")->assertOk();
        $this->assertSame(2, $detail->json('f1.0.trips'));
        $this->assertSame(1_400_000, $detail->json('f1.0.spent'));

        $this->actingAs($a, 'sanctum')->getJson('/api/admin/referrals')->assertForbidden();
    }

    public function test_default_range_is_last_30_days_ending_today(): void
    {
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00', 'Asia/Ho_Chi_Minh'));
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals')->assertOk();

        $this->assertSame('2026-09-21', $res->json('from')); // 30 ngày bao gồm cả 2 đầu mút
        $this->assertSame('2026-10-20', $res->json('to'));
        $this->assertSame('day', $res->json('group'));
    }

    public function test_day_grouping_zero_fills_every_bucket(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-01']);
        $this->trip($a1, 300_000, '2026-10-01 09:00:00', 10, 10);
        $this->trip($a1, 100_000, '2026-10-03 09:00:00', 5, 5);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-03&group=day')
            ->assertOk();

        $series = collect($res->json('series'));
        $this->assertCount(3, $series); // 01,02,03 — ngày 02 không có dữ liệu vẫn phải có bucket
        $this->assertSame(['2026-10-01', '2026-10-02', '2026-10-03'], $series->pluck('key')->all());
        $this->assertSame(['01/10', '02/10', '03/10'], $series->pluck('label')->all());
        $this->assertSame(300_000, $series[0]['f1_revenue']);
        $this->assertSame(0, $series[1]['f1_revenue']);
        $this->assertSame(0, $series[1]['f1_registered']);
        $this->assertSame(100_000, $series[2]['f1_revenue']);
    }

    public function test_week_grouping_starts_monday_and_clips_edge_labels(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-01']);
        // 2026-10-01 là thứ Năm; tuần chứa nó bắt đầu Monday 2026-09-28.
        $this->trip($a1, 300_000, '2026-10-01 09:00:00', 10, 10);
        // Thứ Hai 2026-10-05 — tuần tiếp theo.
        $this->trip($a1, 200_000, '2026-10-05 09:00:00', 10, 10);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-05&group=week')
            ->assertOk();

        $series = collect($res->json('series'));
        $this->assertCount(2, $series);
        $this->assertSame('2026-09-28', $series[0]['key']); // key = Monday thật của tuần, dù bị cắt bởi `from`
        // Tuần Mon 28/09–Chủ nhật 04/10 bị cắt đầu bởi `from=01/10`; các ngày 01–04/10 đều
        // nằm trong [from,to] (dù không có cuốc) nên nhãn vẫn trải hết tới 04/10, không chỉ 01/10.
        $this->assertSame('01/10–04/10', $series[0]['label']);
        $this->assertSame(300_000, $series[0]['f1_revenue']);
        $this->assertSame('2026-10-05', $series[1]['key']);
        $this->assertSame('05/10–05/10', $series[1]['label']);
        $this->assertSame(200_000, $series[1]['f1_revenue']);
    }

    public function test_month_grouping(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-01']);
        $this->trip($a1, 300_000, '2026-09-15 09:00:00', 10, 10);
        $this->trip($a1, 200_000, '2026-10-05 09:00:00', 10, 10);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-09-01&to=2026-10-31&group=month')
            ->assertOk();

        $series = collect($res->json('series'));
        $this->assertCount(2, $series);
        $this->assertSame('2026-09', $series[0]['key']);
        $this->assertSame('09/2026', $series[0]['label']);
        $this->assertSame(300_000, $series[0]['f1_revenue']);
        $this->assertSame('2026-10', $series[1]['key']);
        $this->assertSame('10/2026', $series[1]['label']);
        $this->assertSame(200_000, $series[1]['f1_revenue']);
    }

    public function test_boundary_includes_2359_on_to_and_excludes_next_day_0000(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-01']);
        $this->trip($a1, 300_000, '2026-10-05 23:59:00', 10, 10);
        $this->trip($a1, 999_999, '2026-10-06 00:00:00', 10, 10);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-05&group=day')
            ->assertOk();

        $this->assertSame(300_000, $res->json('summary.f1_revenue'));
    }

    /**
     * Ngày hoàn thành phải bám `completed_at`, KHÔNG phải `updated_at`: một UPDATE
     * bất kỳ sau khi cuốc đã completed (vd AccountDeletionService xoá note của F1
     * đã xoá tài khoản) không được kéo cuốc cũ sang báo cáo tháng hiện tại.
     */
    public function test_attribution_survives_later_update_bumping_updated_at(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-02']);
        $this->trip($a1, 300_000, '2026-09-10 09:00:00', 15, 15);

        // Mô phỏng AccountDeletionService::delete(): update khác (không phải completed_at)
        // sau khi cuốc đã hoàn thành — Eloquent mass update tự đẩy updated_at sang "bây giờ".
        $this->travelTo(Carbon::parse('2026-10-20 10:00:00'));
        Booking::where('customer_id', $a1->id)->update(['note' => null]);

        $sep = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?from=2026-09-01&to=2026-09-30')->assertOk();
        $oct = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-31')->assertOk();

        $this->assertSame(300_000, $sep->json('summary.f1_revenue'));
        $this->assertSame(0, $oct->json('summary.f1_revenue'));
    }

    public function test_422_when_to_before_from(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-10&to=2026-10-01')
            ->assertStatus(422);
    }

    public function test_422_when_range_exceeds_366_days(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2025-01-01&to=2026-01-02') // 367 ngày
            ->assertStatus(422);
    }

    public function test_422_when_group_invalid(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?group=year')
            ->assertStatus(422);
    }

    public function test_driver_referred_customers_excluded_from_f1_metrics(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $driver = User::factory()->create(['role' => 'driver']);
        $d1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $driver->id, 'created_at' => '2026-10-02']);
        $this->trip($d1, 1_000_000, '2026-10-10 09:00:00', 50, 0);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-31')
            ->assertOk();

        $this->assertSame(0, $res->json('summary.f1_registered'));
        $this->assertSame(0, $res->json('summary.f1_revenue'));
        $this->assertSame([], $res->json('top'));
        // reward_points vẫn tính vì là tổng mọi cuốc completed, không riêng F1.
        $this->assertSame(50, $res->json('summary.reward_points'));
    }

    public function test_top_10_limited_to_range(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-08-01']);
        // Doanh số lớn nhưng NGOÀI khoảng lọc — không được vào top của khoảng này.
        $this->trip($a1, 5_000_000, '2026-08-15 09:00:00', 10, 10);
        $this->trip($a1, 100_000, '2026-10-10 09:00:00', 5, 5);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-31')
            ->assertOk();

        $this->assertSame(100_000, $res->json('top.0.f1_revenue'));
    }

    public function test_detail_with_range_matches_top_row_for_that_range(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-01']);
        $a2 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-09-01']);
        $this->trip($a1, 300_000, '2026-10-10 09:00:00', 15, 15);
        $this->trip($a1, 500_000, '2026-09-10 09:00:00', 25, 25); // ngoài khoảng
        $this->trip($a2, 200_000, '2026-10-20 09:00:00', 10, 10);

        $q = 'from=2026-10-01&to=2026-10-31';
        $row = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals?{$q}")->assertOk()->json('top.0');
        $detail = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$a->id}?{$q}")->assertOk();

        $f1 = collect($detail->json('f1'));
        $this->assertSame($row['f1_revenue'], $f1->sum('spent'));
        $this->assertSame($row['commission_points'], $f1->sum('commission_points'));
        $this->assertSame(500_000, $f1->sum('spent'));
        $this->assertSame(1, $f1->firstWhere('id', $a1->id)['trips']);

        // Không gửi from/to → trọn đời như cũ.
        $life = collect($this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$a->id}")->assertOk()->json('f1'));
        $this->assertSame(1_000_000, $life->sum('spent'));

        // Khoảng sai → 422 (cùng validate DateBuckets).
        $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$a->id}?from=2026-10-31&to=2026-10-01")->assertStatus(422);
    }

    public function test_deleted_accounts_show_null_phone_and_still_count(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = User::factory()->create(['role' => 'customer', 'name' => 'A']);
        $a1 = User::factory()->create(['role' => 'customer', 'referred_by_user_id' => $a->id, 'created_at' => '2026-10-02']);
        $this->trip($a1, 300_000, '2026-10-10 09:00:00', 15, 15);
        foreach ([$a, $a1] as $u) {
            $u->forceFill(['name' => 'Người dùng đã xoá', 'phone' => "deleted-{$u->id}", 'deleted_at' => now()])->save();
        }

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/admin/referrals?from=2026-10-01&to=2026-10-31')->assertOk();
        $this->assertSame($a->id, $res->json('top.0.id'));
        $this->assertNull($res->json('top.0.phone'));
        $this->assertSame(300_000, $res->json('top.0.f1_revenue'));
        $this->assertSame(1, $res->json('summary.f1_registered'));

        $detail = $this->actingAs($admin, 'sanctum')->getJson("/api/admin/referrals/{$a->id}")->assertOk();
        $this->assertNull($detail->json('phone'));
        $this->assertNull($detail->json('f1.0.phone'));
        $this->assertSame('Người dùng đã xoá', $detail->json('f1.0.name'));
        $this->assertSame(1, $detail->json('f1.0.trips'));
    }
}
