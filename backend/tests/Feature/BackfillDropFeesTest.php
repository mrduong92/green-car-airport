<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\BookingDriverCancellation;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * affiliate:backfill-drop-fees dựng lại forfeited_fee_points của các lần bỏ cuốc cũ từ sổ ví.
 * Fixture đi qua API thật (đường bỏ cuốc hiện tại đã ghi đúng số) rồi xoá về 0 như dữ liệu cũ —
 * lệnh phải dựng lại ĐÚNG số đó.
 */
class BackfillDropFeesTest extends TestCase
{
    use RefreshDatabase;

    private function driver(int $points = 1000): User
    {
        $d = User::factory()->create(['role' => 'driver']);
        $d->driverProfile()->create([
            'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2022, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => 'active',
        ]);
        Wallet::create(['user_id' => $d->id, 'points' => $points]);

        return $d;
    }

    private function booking(int $pointsUsed = 0): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id, 'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài', 'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00',
            'vehicle_type' => 'sedan_4', 'distance_km' => 30, 'price' => 500_000, 'discount' => 0, 'surcharge' => 0,
            'points_used' => $pointsUsed, 'status' => 'finding_driver',
        ]);
    }

    private function acceptAndDrop(User $d, Booking $b): void
    {
        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$b->id}/accept")->assertOk();
        $this->travel(5)->minutes();
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$b->id}/cancel", ['reason' => 'Bận'])->assertOk();
        $this->travel(5)->minutes();
    }

    /** Xoá về 0 như log cũ, trả về [id => số đúng] để so (id không giả định — MySQL không reset auto-increment). */
    private function wipe(): array
    {
        $truth = BookingDriverCancellation::orderBy('id')->pluck('forfeited_fee_points', 'id')->all();
        BookingDriverCancellation::query()->update(['forfeited_fee_points' => 0]);

        return $truth;
    }

    private function current(): array
    {
        return BookingDriverCancellation::orderBy('id')->pluck('forfeited_fee_points', 'id')->all();
    }

    public function test_single_drop_dry_run_then_apply(): void
    {
        $d = $this->driver();
        $b = $this->booking(50); // phí 100, trừ lúc nhận 50, bỏ thì thu thêm 50 đã miễn
        $this->acceptAndDrop($d, $b);
        $truth = $this->wipe();
        $this->assertSame([100], array_values($truth));

        $this->artisan('affiliate:backfill-drop-fees')->expectsOutputToContain('DRY-RUN')->assertSuccessful();
        $this->assertSame([0], array_values($this->current())); // dry-run không ghi

        $this->artisan('affiliate:backfill-drop-fees', ['--apply' => true])->assertSuccessful();
        $this->assertSame($truth, $this->current());
    }

    public function test_two_drops_by_different_drivers_are_attributed_per_accept_cycle(): void
    {
        $a = $this->driver();
        $b = $this->driver();
        $trip = $this->booking(); // phí 100 điểm, không dùng điểm
        $this->acceptAndDrop($a, $trip);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '10'); // lần nhận sau ở tỉ lệ khác → 50 điểm
        $this->acceptAndDrop($b, $trip);
        // Tài xế A nhận lại lần nữa rồi bỏ — lượt thứ hai của A không được gộp với lượt đầu.
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '30');
        $this->acceptAndDrop($a, $trip);

        $truth = $this->wipe();
        $this->assertSame([100, 50, 150], array_values($truth));

        $this->artisan('affiliate:backfill-drop-fees', ['--apply' => true])->assertSuccessful();
        $this->assertSame($truth, $this->current());
    }

    public function test_drop_after_shortfall_counts_unrecovered_shortfall_as_loss(): void
    {
        $d = $this->driver();
        $trip = $this->booking(50);
        AppSetting::set(AppSetting::APP_FEE_PERCENT, '5'); // phí 25 < 50 điểm → trừ 0, app bù 25, miễn 25

        $this->actingAs($d, 'sanctum')->postJson("/api/driver/trips/{$trip->id}/accept")->assertOk();
        Wallet::where('user_id', $d->id)->update(['points' => 10]); // đã tiêu phần bù
        $this->travel(5)->minutes();
        $this->actingAs($d, 'sanctum')->patchJson("/api/driver/trips/{$trip->id}/cancel", ['reason' => 'Bận'])->assertOk();

        // Bù 25, thu lại được 10, ví còn 0 nên phần miễn không thu được → app lỗ 15.
        $truth = $this->wipe();
        $this->assertSame([-15], array_values($truth));

        $this->artisan('affiliate:backfill-drop-fees', ['--apply' => true])->assertSuccessful();
        $this->assertSame($truth, $this->current());
    }

    public function test_apply_is_idempotent_and_skips_rows_already_set(): void
    {
        $d = $this->driver();
        $first = $this->booking();
        $second = $this->booking();
        $this->acceptAndDrop($d, $first);
        $this->acceptAndDrop($d, $second);
        $this->wipe();
        BookingDriverCancellation::where('booking_id', $second->id)->update(['forfeited_fee_points' => 7]); // đã có số — không đụng

        $this->artisan('affiliate:backfill-drop-fees', ['--apply' => true])->assertSuccessful();
        $this->assertSame([100, 7], array_values($this->current()));

        $this->artisan('affiliate:backfill-drop-fees', ['--apply' => true])
            ->expectsOutputToContain('xét 0 dòng = 0')->assertSuccessful();
        $this->assertSame([100, 7], array_values($this->current()));
    }
}
