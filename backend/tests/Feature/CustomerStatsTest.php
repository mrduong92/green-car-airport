<?php

// backend/tests/Feature/CustomerStatsTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
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
        // chỉ tính giảm giá của chuyến HOÀN THÀNH — voucher của đơn đã huỷ không phải tiền khách tiết kiệm
        $res->assertJsonPath('total_saved', 50_000);
    }

    public function test_totals_subtract_and_count_points_used(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $today = now()->format('Y-m-d');

        // final_price = price - discount - points_used*1000 + surcharge + collection_fee
        $this->makeBooking($customer, 'completed', $today, [
            'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
        ]);

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=month')
            ->assertOk();

        // 500.000 - 50.000 - 40*1.000 = 410.000
        $res->assertJsonPath('total_spent', 410_000);
        // tiết kiệm = voucher + điểm đã dùng = 50.000 + 40.000 = 90.000
        $res->assertJsonPath('total_saved', 90_000);
    }

    public function test_total_saved_excludes_points_already_refunded(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $today = now()->format('Y-m-d');

        // Điểm đã hoàn (huỷ cuốc) không còn là khoản khách tiết kiệm được thật sự.
        $this->makeBooking($customer, 'completed', $today, [
            'price' => 500_000, 'discount' => 0, 'points_used' => 30, 'points_refunded_at' => now(),
        ]);
        $this->makeBooking($customer, 'completed', $today, [
            'price' => 500_000, 'discount' => 0, 'points_used' => 20,
        ]);

        $res = $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/stats?period=month')
            ->assertOk();

        // Chỉ tính 20 điểm chưa hoàn = 20.000, bỏ 30 điểm đã hoàn.
        $res->assertJsonPath('total_saved', 20_000);
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

    private function reward(User $u, string $kind, int $points, string $at, string $type = 'credit', string $balance = 'reward'): void
    {
        $wallet = Wallet::firstOrCreate(['user_id' => $u->id], ['points' => 0, 'reward_points' => 0]);
        $tx = WalletTransaction::create([
            'wallet_id' => $wallet->id, 'type' => $type, 'balance' => $balance, 'kind' => $kind,
            'description' => 't', 'points' => $points,
        ]);
        WalletTransaction::whereKey($tx->id)->update(['created_at' => $at]);
    }

    private function stats(User $u, string $qs)
    {
        return $this->actingAs($u, 'sanctum')->getJson('/api/customer/stats?'.$qs);
    }

    public function test_default_range_is_this_month_by_day(): void
    {
        $c = User::factory()->create(['role' => 'customer']);

        $res = $this->stats($c, '')->assertOk();

        $this->assertSame(now()->startOfMonth()->format('Y-m-d'), $res->json('from'));
        $this->assertSame(now()->format('Y-m-d'), $res->json('to'));
        $this->assertSame('day', $res->json('group'));
        $this->assertCount((int) now()->format('j'), $res->json('series'));
    }

    public function test_day_series_zero_filled_with_all_metrics(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($c, 'completed', '2026-10-02', ['price' => 400_000, 'discount' => 50_000]);
        $this->makeBooking($c, 'cancelled', '2026-10-02');
        $this->reward($c, 'cashback', 20, '2026-10-03 10:00:00');
        $this->reward($c, 'commission', 7, '2026-10-03 11:00:00');

        $res = $this->stats($c, 'from=2026-10-01&to=2026-10-04&group=day')->assertOk();

        $series = $res->json('series');
        $this->assertCount(4, $series);
        $this->assertSame(['key' => '2026-10-01', 'label' => '01/10', 'spent' => 0, 'completed' => 0, 'cancelled' => 0, 'cashback_points' => 0, 'commission_points' => 0], $series[0]);
        $this->assertSame(350_000, $series[1]['spent']);
        $this->assertSame(1, $series[1]['completed']);
        $this->assertSame(1, $series[1]['cancelled']);
        $this->assertSame(20, $series[2]['cashback_points']);
        $this->assertSame(7, $series[2]['commission_points']);
        $this->assertSame(['completed' => 1, 'cancelled' => 1, 'total_spent' => 350_000, 'total_saved' => 50_000, 'reward_points' => 27], $res->json('summary'));
    }

    public function test_week_grouping_starts_monday_and_clips_edges(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        // 2026-10-07 là thứ Tư; tuần 05/10–11/10
        $this->makeBooking($c, 'completed', '2026-10-07');

        $res = $this->stats($c, 'from=2026-10-01&to=2026-10-14&group=week')->assertOk();

        $series = $res->json('series');
        $this->assertSame(['2026-09-28', '2026-10-05', '2026-10-12'], array_column($series, 'key'));
        $this->assertSame(['01/10–04/10', '05/10–11/10', '12/10–14/10'], array_column($series, 'label'));
        $this->assertSame([0, 500_000, 0], array_column($series, 'spent'));
    }

    public function test_month_grouping_zero_fills(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($c, 'completed', '2026-08-15');
        $this->makeBooking($c, 'completed', '2026-10-15');

        $res = $this->stats($c, 'from=2026-08-10&to=2026-10-20&group=month')->assertOk();

        $series = $res->json('series');
        $this->assertSame(['2026-08', '2026-09', '2026-10'], array_column($series, 'key'));
        $this->assertSame(['08/2026', '09/2026', '10/2026'], array_column($series, 'label'));
        $this->assertSame([500_000, 0, 500_000], array_column($series, 'spent'));
    }

    public function test_boundaries_are_inclusive_for_trips_and_reward_timestamps(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($c, 'completed', '2026-09-30');   // trước from
        $this->makeBooking($c, 'completed', '2026-10-01');   // = from
        $this->makeBooking($c, 'completed', '2026-10-10');   // = to
        $this->makeBooking($c, 'completed', '2026-10-11');   // sau to
        $this->reward($c, 'cashback', 5, '2026-09-30 23:59:59');
        $this->reward($c, 'cashback', 6, '2026-10-01 00:00:00');
        $this->reward($c, 'cashback', 7, '2026-10-10 23:59:59');
        $this->reward($c, 'cashback', 8, '2026-10-11 00:00:00');

        $res = $this->stats($c, 'from=2026-10-01&to=2026-10-10')->assertOk();

        $this->assertSame(2, $res->json('summary.completed'));
        $this->assertSame(1_000_000, $res->json('summary.total_spent'));
        $this->assertSame(13, $res->json('summary.reward_points'));
    }

    public function test_reward_points_only_own_credit_cashback_or_commission_on_reward_balance(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $at = '2026-10-05 09:00:00';
        $this->reward($me, 'cashback', 10, $at);
        $this->reward($me, 'commission', 4, $at);
        $this->reward($me, 'refund', 99, $at);                         // kind khác
        $this->reward($me, 'cashback', 50, $at, 'debit');              // trừ điểm
        $this->reward($me, 'cashback', 77, $at, 'credit', 'main');     // ví điểm cuốc, không phải thưởng
        $this->reward($other, 'cashback', 1000, $at);

        $res = $this->stats($me, 'from=2026-10-01&to=2026-10-10')->assertOk();

        $this->assertSame(14, $res->json('summary.reward_points'));
        $this->assertSame(10, collect($res->json('series'))->sum('cashback_points'));
        $this->assertSame(4, collect($res->json('series'))->sum('commission_points'));
    }

    public function test_other_customers_trips_excluded_from_series(): void
    {
        $me = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($other, 'completed', '2026-10-02');

        $res = $this->stats($me, 'from=2026-10-01&to=2026-10-03')->assertOk();

        $this->assertSame(0, collect($res->json('series'))->sum('spent'));
        $this->assertSame(0, $res->json('summary.completed'));
    }

    public function test_422_for_bad_ranges_and_group(): void
    {
        $c = User::factory()->create(['role' => 'customer']);

        $this->stats($c, 'from=2026-10-10&to=2026-10-01')->assertStatus(422);
        $this->stats($c, 'from=2025-01-01&to=2026-10-01')->assertStatus(422);
        $this->stats($c, 'from=2026-10-01&to=2026-10-02&group=year')->assertStatus(422);
        $this->stats($c, 'from=bad&to=2026-10-02')->assertStatus(422);
    }

    public function test_legacy_period_keeps_legacy_keys_and_new_keys(): void
    {
        $c = User::factory()->create(['role' => 'customer']);
        $this->makeBooking($c, 'completed', now()->format('Y-m-d'));

        $res = $this->stats($c, 'period=week')->assertOk();

        $res->assertJsonPath('period', 'week');
        $res->assertJsonPath('completed', 1);
        $res->assertJsonPath('total_spent', 500_000);
        $res->assertJsonCount(7, 'points');
        $this->assertSame(['label' => now()->format('d/m'), 'value' => 500_000], $res->json('points.6'));
        $this->assertSame(now()->subDays(6)->format('Y-m-d'), $res->json('from'));
        $this->assertCount(7, $res->json('series'));

        $all = $this->stats($c, 'period=all')->assertOk();
        $this->assertSame('month', $all->json('group'));
        $this->assertSame(now()->subMonths(5)->startOfMonth()->format('Y-m-d'), $all->json('from'));
        $this->assertSame(now()->subMonths(5)->startOfMonth()->format('m/y'), $all->json('points.0.label'));
    }

    public function test_from_to_take_precedence_over_period(): void
    {
        $c = User::factory()->create(['role' => 'customer']);

        $res = $this->stats($c, 'period=week&from=2026-10-01&to=2026-10-03')->assertOk();

        $this->assertSame('2026-10-01', $res->json('from'));
        $this->assertCount(3, $res->json('series'));
    }
}
