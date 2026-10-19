<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\BookingDriverCancellation;
use App\Models\User;
use App\Models\Wallet;
use App\Services\WhitePlateRetirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminRevenueTest extends TestCase
{
    use RefreshDatabase;

    /**
     * RevenueController chỉ dùng SQL portable (DATE(), SUBSTR()), nhãn dựng ở PHP — bộ test
     * chạy được cả trên sqlite in-memory mặc định. MySQL (ONLY_FULL_GROUP_BY, cột ambiguous khi join users) vẫn nên chạy lại bằng:
     *   docker compose exec -T -e DB_CONNECTION=mysql -e DB_HOST=mysql \
     *     -e DB_DATABASE=green_car_airport_test app php artisan test --filter=AdminRevenueTest
     */
    private function makeCompletedBooking(User $customer, ?User $driver = null): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id,
            'driver_id' => $driver?->id,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 500_000,
            'discount' => 50_000,
            'surcharge' => 0,
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }

    private function activeDriver(int $points = 1000): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        $d->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $d->id, 'points' => $points]);

        return $d;
    }

    /** Base 500k, không voucher, phí 20% = 100 điểm; khách dùng 50 điểm → trừ lúc nhận 50, miễn 50. */
    private function pointsBooking(User $customer): Booking
    {
        return Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 500_000, 'discount' => 0, 'surcharge' => 0, 'points_used' => 50, 'status' => 'finding_driver',
        ]);
    }

    /**
     * Hồi quy: query "Top tài xế" join bảng `users`, mà cả `bookings` và `users`
     * đều có cột `created_at` — không qualify tên bảng thì MySQL báo
     * "Column 'created_at' in where clause is ambiguous" và trang Doanh thu trả 500.
     */
    public function test_revenue_page_works_when_bookings_have_drivers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver', 'name' => 'Tài Xế A']);

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
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver']);

        $this->makeCompletedBooking($customer, $driver);

        foreach (['today', 'week', 'month'] as $period) {
            $this->actingAs($admin)
                ->getJson("/api/admin/revenue?period={$period}")
                ->assertOk();
        }
    }

    /**
     * Cuốc cũ (charged_fee_points NULL — nhận trước bản trừ-lúc-nhận): phí thực thu
     * = appFeePoints − points_used theo tỉ lệ hiện tại.
     */
    public function test_app_fee_subtracts_points_used(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $driver = User::factory()->create(['role' => 'driver']);

        // effective = 500k - 50k = 450k → phí 20% = 90k. Khách dùng 40 điểm
        // (app bù 40.000đ) → phí thực thu = 90.000 - 40.000 = 50.000.
        Booking::create([
            'customer_id' => $customer->id, 'driver_id' => $driver->id,
            'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 0, 'status' => 'completed', 'completed_at' => now(),
        ]);

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week');

        $res->assertOk();
        $res->assertJsonPath('app_fee', 50_000);
        $res->assertJsonPath('chart.0.fee', 50_000);
    }

    /**
     * Phí app = phí THỰC giữ lại từng cuốc (charged_fee_points − held_shortfall_points),
     * không phải doanh thu × tỉ lệ HIỆN TẠI — admin đổi tỉ lệ sau khi cuốc đã nhận thì
     * báo cáo không được đổi theo. Lọc/gom theo ngày HOÀN THÀNH (completed_at).
     */
    public function test_app_fee_uses_fee_actually_kept_and_completed_at(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $base = [
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'surcharge' => 0, 'status' => 'completed',
        ];

        // A: nhận ở 20% (trừ 100 − 50 điểm = 50), tạo 20 ngày trước nhưng HOÀN THÀNH hôm nay.
        $a = Booking::create($base + [
            'price' => 500_000, 'discount' => 0, 'points_used' => 50,
            'charged_fee_points' => 50, 'held_shortfall_points' => 0, 'completed_at' => now(),
        ]);
        Booking::whereKey($a->id)->update(['created_at' => now()->subDays(20)]);
        // B: cuốc cũ (charged NULL — tính lại theo tỉ lệ hiện tại) — 10% × 450k = 45k.
        Booking::create($base + ['price' => 500_000, 'discount' => 50_000, 'points_used' => 0, 'completed_at' => now()]);
        // C: phí bị clamp 0, app bù 25 điểm cho tài xế → app MẤT 25k.
        Booking::create($base + [
            'price' => 500_000, 'discount' => 0, 'points_used' => 50,
            'charged_fee_points' => 0, 'held_shortfall_points' => 25, 'completed_at' => now(),
        ]);
        // D: tạo hôm nay nhưng hoàn thành 20 ngày trước — không thuộc tuần này.
        Booking::create($base + [
            'price' => 900_000, 'discount' => 0, 'points_used' => 0,
            'charged_fee_points' => 180, 'held_shortfall_points' => 0, 'completed_at' => now()->subDays(20),
        ]);

        AppSetting::set(AppSetting::APP_FEE_PERCENT, '10'); // admin hạ tỉ lệ SAU khi A, C đã nhận

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk();

        $res->assertJsonPath('trips_completed', 3);
        $res->assertJsonPath('total_revenue', 1_450_000);
        $res->assertJsonPath('app_fee', 50_000 + 45_000 - 25_000);
        $res->assertJsonPath('chart.0.label', now()->format('d/m'));
        $res->assertJsonPath('chart.0.fee', 70_000);
    }

    /**
     * Tài xế A bỏ cuốc: app GIỮ phí đã trừ (50) + thu phần đã miễn (50) = 100 điểm. Rồi tài xế B
     * nhận lại và chạy xong: app giữ 50. Phí app = 100k + 50k — phần A mất không được biến mất chỉ
     * vì refundAcceptCharges() xoá charged_fee_points trên booking.
     */
    public function test_app_fee_includes_fee_forfeited_by_driver_drop(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = $this->activeDriver();
        $b = $this->activeDriver();
        $trip = $this->pointsBooking(User::factory()->create(['role' => 'customer']));

        $this->actingAs($a, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        $this->actingAs($a, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/cancel", ['reason' => 'Bận'])->assertOk();
        $this->assertDatabaseHas('booking_driver_cancellations', ['booking_id' => $trip->id, 'driver_id' => $a->id, 'forfeited_fee_points' => 100]);

        $this->actingAs($b, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        $this->actingAs($b, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/status", ['status' => 'in_progress'])->assertOk();
        $this->actingAs($b, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/status", ['status' => 'completed'])->assertOk();
        $this->assertNotNull($trip->fresh()->completed_at); // đường hoàn thành duy nhất luôn ghi completed_at

        foreach (['today', 'week', 'month'] as $period) {
            $res = $this->actingAs($admin)->getJson("/api/admin/revenue?period={$period}")->assertOk();
            $res->assertJsonPath('trips_completed', 1);
            $res->assertJsonPath('total_revenue', 500_000);
            $res->assertJsonPath('app_fee', 150_000);
            $this->assertSame(150_000, array_sum(array_column($res->json('chart'), 'fee')));
        }
    }

    /** Bỏ cuốc rồi cuốc hết hạn/huỷ (không ai chạy xong): phần A mất vẫn là phí app theo ngày bỏ. */
    public function test_app_fee_counts_forfeit_even_if_booking_never_completes(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $a = $this->activeDriver();
        $trip = $this->pointsBooking(User::factory()->create(['role' => 'customer']));

        $this->actingAs($a, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        $this->actingAs($a, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/cancel", ['reason' => 'Bận'])->assertOk();
        Booking::whereKey($trip->id)->update(['status' => 'cancelled', 'cancelled_by' => 'system', 'cancelled_at' => now()]);

        $res = $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk();
        $res->assertJsonPath('trips_completed', 0);
        $res->assertJsonPath('total_revenue', 0);
        $res->assertJsonPath('app_fee', 100_000);
        $res->assertJsonPath('chart.0.label', now()->format('d/m'));
        $res->assertJsonPath('chart.0.revenue', 0);
        $res->assertJsonPath('chart.0.fee', 100_000);

        // Bỏ cuốc ngoài kỳ thì không tính.
        BookingDriverCancellation::where('booking_id', $trip->id)->update(['cancelled_at' => now()->subDays(20)]);
        $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk()->assertJsonPath('app_fee', 0);
    }

    /**
     * Khách huỷ cuốc mà tài xế đã TIÊU phần app bù (shortfall 25 điểm, ví còn 10): app chỉ thu
     * lại được 10 → mất 15 điểm. Khoản lỗ này tính vào phí app theo NGÀY HUỶ (refundAcceptCharges()
     * đã xoá charged/held trên booking, nên phải lấy từ log booking_cancellation_fees).
     */
    public function test_customer_cancel_with_unrecoverable_shortfall_reduces_app_fee_that_day(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $d = $this->activeDriver();
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 1000]);
        $trip = $this->pointsBooking($c);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5'); // phí 25 < 50 điểm khách dùng → app bù 25

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        Wallet::where('user_id', $d->id)->update(['points' => 10]); // tài xế đã tiêu phần bù
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$trip->id}/cancel")->assertOk();

        $this->assertDatabaseHas('booking_cancellation_fees', [
            'booking_id' => $trip->id, 'driver_id' => $d->id, 'cancelled_by' => 'customer', 'kept_fee_points' => -15,
        ]);
        foreach (['today', 'week', 'month'] as $period) {
            $res = $this->actingAs($admin)->getJson("/api/admin/revenue?period={$period}")->assertOk();
            $res->assertJsonPath('trips_completed', 0);
            $res->assertJsonPath('app_fee', -15_000);
            $this->assertSame(-15_000, array_sum(array_column($res->json('chart'), 'fee')));
        }

        // Huỷ ngoài kỳ thì không tính.
        DB::table('booking_cancellation_fees')->update(['cancelled_at' => now()->subDays(20)]);
        $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk()->assertJsonPath('app_fee', 0);
    }

    /** Khách huỷ bình thường: tài xế được hoàn đủ, app không giữ gì → không ghi log, phí app 0. */
    public function test_normal_customer_cancel_has_no_app_fee_effect(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $d = $this->activeDriver();
        $c = User::factory()->create(['role' => 'customer']);
        Wallet::create(['user_id' => $c->id, 'reward_points' => 1000]);
        $trip = $this->pointsBooking($c);

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        $this->actingAs($c, 'sanctum')->patchJson("/api/bookings/{$trip->id}/cancel")->assertOk();

        $this->assertDatabaseCount('booking_cancellation_fees', 0);
        $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk()
            ->assertJsonPath('app_fee', 0)
            ->assertJsonPath('chart', []);
    }

    /** Hệ thống gỡ cuốc (xe biển trắng) sau khi tài xế tiêu phần bù: khoản lỗ cũng vào phí app. */
    public function test_white_plate_release_with_unrecoverable_shortfall_reduces_app_fee(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $d = $this->activeDriver();
        $trip = $this->pointsBooking(User::factory()->create(['role' => 'customer']));
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5');

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        Wallet::where('user_id', $d->id)->update(['points' => 10]);
        $this->assertSame(1, app(WhitePlateRetirement::class)->releaseDriverTrips($d->id));

        $this->assertDatabaseHas('booking_cancellation_fees', [
            'booking_id' => $trip->id, 'driver_id' => $d->id, 'cancelled_by' => 'system', 'kept_fee_points' => -15,
        ]);
        $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk()->assertJsonPath('app_fee', -15_000);
    }

    /**
     * Cuốc cũ: ROUND trên số thập phân, không phải phép chia nguyên — 20% × 517.500 = 103,5 điểm
     * → 104 trên cả MySQL lẫn sqlite (chia nguyên trên sqlite cho 103).
     */
    public function test_legacy_fee_rounds_half_up_not_integer_division(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4',
            'distance_km' => 30, 'price' => 517_500, 'discount' => 0, 'points_used' => 0,
            'surcharge' => 0, 'status' => 'completed', 'completed_at' => now(),
        ]);

        $this->actingAs($admin)->getJson('/api/admin/revenue?period=week')->assertOk()
            ->assertJsonPath('app_fee', 104_000);
    }

    /** Nhãn biểu đồ theo GIỜ hoàn thành cho kỳ "Hôm nay". */
    public function test_today_chart_is_bucketed_by_completion_hour(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $customer = User::factory()->create(['role' => 'customer']);
        $b = $this->makeCompletedBooking($customer);
        $at = today()->setTime(9, 15);
        Booking::whereKey($b->id)->update(['completed_at' => $at]);

        $this->actingAs($admin)->getJson('/api/admin/revenue?period=today')->assertOk()
            ->assertJsonPath('chart.0.label', '09:00')
            ->assertJsonPath('chart.0.revenue', 450_000);
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
