<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Trước đây tab Lịch sử của tài xế chỉ liệt kê cuốc `completed` — cuốc bị
 * khách huỷ (dù vẫn gắn driver_id) hoặc cuốc tài xế tự bỏ (quay lại hàng đợi,
 * mất driver_id) đều biến mất khỏi Lịch sử, tài xế không có cách nào xem lại
 * ai huỷ / lý do / thời gian. Xem docs/superpowers/specs (báo cáo 2026-08-11).
 */
class DriverCancellationHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function makeDriver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        $driver->driverProfile()->create([
            'vehicle_make' => 'Toyota',
            'vehicle_model' => 'Camry',
            'vehicle_plate' => '51G-'.random_int(10000, 99999),
            'vehicle_year' => 2020,
            'vehicle_color' => 'Trắng',
            'vehicle_type' => 'sedan_4',
            'status' => 'active',
        ]);
        Wallet::create(['user_id' => $driver->id, 'points' => 1000]);

        return $driver;
    }

    private function makeBooking(string $status, ?int $driverId): Booking
    {
        return Booking::create([
            'customer_id' => User::factory()->create(['role' => 'customer'])->id,
            'driver_id' => $driverId,
            'pickup' => 'Hà Nội',
            'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'),
            'time' => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km' => 30,
            'price' => 300_000,
            'discount' => 0,
            'surcharge' => 0,
            'status' => $status,
            'accepted_at' => in_array($status, ['accepted', 'picking_up'], true) ? now() : null,
        ]);
    }

    public function test_history_shows_booking_cancelled_by_customer_with_reason(): void
    {
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('cancelled', $driver->id);
        $booking->update([
            'cancelled_at' => now(),
            'cancelled_by' => 'customer',
            'cancel_reason' => 'Đổi lịch bay',
        ]);

        $response = $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips/history')
            ->assertOk();

        $entry = collect($response->json())->firstWhere('id', $booking->id);
        $this->assertNotNull($entry, 'Cuốc bị khách huỷ phải xuất hiện trong Lịch sử');
        $this->assertSame('cancelled', $entry['status']);
        $this->assertSame('customer', $entry['cancelled_by']);
        $this->assertSame('Đổi lịch bay', $entry['cancel_reason']);
        $this->assertNotNull($entry['cancelled_at']);
    }

    public function test_driver_cancel_records_reason_and_shows_in_history(): void
    {
        $driver = $this->makeDriver();
        $booking = $this->makeBooking('accepted', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/cancel", ['reason' => 'Xe hư dọc đường'])
            ->assertOk();

        $response = $this->actingAs($driver, 'sanctum')
            ->getJson('/api/driver/trips/history')
            ->assertOk();

        $entry = collect($response->json())->firstWhere('id', $booking->id);
        $this->assertNotNull($entry, 'Cuốc tài xế tự bỏ phải xuất hiện trong Lịch sử của chính tài xế đó');
        $this->assertSame('cancelled', $entry['status']);
        $this->assertSame('driver', $entry['cancelled_by']);
        $this->assertSame('Xe hư dọc đường', $entry['cancel_reason']);
        $this->assertSame(0, $entry['net_earning']);
    }

    public function test_driver_drop_still_shows_in_history_after_another_driver_completes_it(): void
    {
        $firstDriver = $this->makeDriver();
        $secondDriver = $this->makeDriver();
        $booking = $this->makeBooking('accepted', $firstDriver->id);

        $this->actingAs($firstDriver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/cancel", ['reason' => 'Kẹt xe không tới kịp'])
            ->assertOk();

        // Tài xế khác nhận lại đúng booking này rồi hoàn thành.
        $booking->refresh();
        $booking->update(['driver_id' => $secondDriver->id, 'status' => 'completed']);

        $historyOfFirstDriver = $this->actingAs($firstDriver, 'sanctum')
            ->getJson('/api/driver/trips/history')
            ->assertOk()
            ->json();

        $entry = collect($historyOfFirstDriver)->firstWhere('id', $booking->id);
        $this->assertNotNull($entry, 'Dù booking đã được tài xế khác hoàn thành, lịch sử của tài xế đã bỏ vẫn phải còn');
        $this->assertSame('cancelled', $entry['status']);
        $this->assertSame('driver', $entry['cancelled_by']);
        $this->assertSame('Kẹt xe không tới kịp', $entry['cancel_reason']);

        $historyOfSecondDriver = $this->actingAs($secondDriver, 'sanctum')
            ->getJson('/api/driver/trips/history')
            ->assertOk()
            ->json();
        $entryForSecond = collect($historyOfSecondDriver)->firstWhere('id', $booking->id);
        $this->assertSame('completed', $entryForSecond['status']);
    }

    public function test_driver_can_view_detail_of_trip_they_dropped(): void
    {
        $driver = $this->makeDriver();
        $otherDriver = $this->makeDriver();
        $booking = $this->makeBooking('accepted', $driver->id);

        $this->actingAs($driver, 'sanctum')
            ->patchJson("/api/driver/trips/{$booking->id}/cancel", ['reason' => 'Khách không nghe máy'])
            ->assertOk();

        $this->actingAs($driver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertOk()
            ->assertJsonPath('cancelled_by', 'driver')
            ->assertJsonPath('cancel_reason', 'Khách không nghe máy');

        // Tài xế khác không liên quan không được xem lại cuốc này qua log của người khác.
        $this->actingAs($otherDriver, 'sanctum')
            ->getJson("/api/driver/trips/{$booking->id}")
            ->assertForbidden();
    }
}
