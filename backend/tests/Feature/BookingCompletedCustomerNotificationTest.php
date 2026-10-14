<?php

// backend/tests/Feature/BookingCompletedCustomerNotificationTest.php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Notifications\BookingCompletedCustomerNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * CR #5: push "Hoàn thành chuyến" trước đây hiện price − discount + surcharge, bỏ sót phần
 * điểm thưởng khách đã dùng — số tiền hiện ra SAI (cao hơn thực tế khách trả). Phải dùng
 * Booking::finalPrice() (net điểm, gồm thu hộ) — nguồn DUY NHẤT khớp formatBooking.
 */
class BookingCompletedCustomerNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_push_body_amount_is_net_of_points_used(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $booking = Booking::create([
            'customer_id' => $customer->id, 'pickup' => 'Hà Nội', 'destination' => 'Sân bay Nội Bài',
            'date' => now()->addDay()->format('Y-m-d'), 'time' => '08:00', 'vehicle_type' => 'sedan_4', 'distance_km' => 30,
            'price' => 500_000, 'discount' => 50_000, 'surcharge' => 20_000, 'points_used' => 30, 'status' => 'completed',
        ]);

        $push = (new BookingCompletedCustomerNotification($booking))->toWebPush($customer, null);

        // finalPrice() = basePrice(450.000) − điểm(30×1.000=30.000) + surcharge(20.000) = 440.000
        $this->assertStringContainsString('440.000', $push['body']);
        $this->assertStringNotContainsString('470.000', $push['body']); // công thức cũ (bỏ sót điểm) ra số này
    }
}
