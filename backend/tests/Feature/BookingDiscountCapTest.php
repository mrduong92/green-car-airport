<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingDiscountCapTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): User
    {
        return User::factory()->create(['role' => 'customer']);
    }

    private function payload(string $voucherCode): array
    {
        return [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 250_000,
            'voucher_code' => $voucherCode,
        ];
    }

    public function test_booking_caps_discount_at_10_percent(): void
    {
        // 100k voucher on 250k ride → discount stored as 25k, final_price = 225k
        $voucher = Voucher::create([
            'code'        => 'BIG100K',
            'type'        => 'fixed',
            'value'       => 100_000,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson([
                'discount'    => 25_000,
                'final_price' => 225_000,
            ]);

        $this->assertDatabaseHas('bookings', ['discount' => 25_000]);
    }

    public function test_booking_does_not_cap_small_discount(): void
    {
        // 10k voucher on 250k ride → discount stays 10k, final_price = 240k
        $voucher = Voucher::create([
            'code'        => 'SMALL10K',
            'type'        => 'fixed',
            'value'       => 10_000,
            'is_active'   => true,
            'expires_at'  => now()->addDays(30),
            'usage_limit' => null,
            'usage_count' => 0,
        ]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/bookings', $this->payload($voucher->code))
            ->assertCreated()
            ->assertJson([
                'discount'    => 10_000,
                'final_price' => 240_000,
            ]);
    }
}
