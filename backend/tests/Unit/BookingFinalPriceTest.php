<?php

namespace Tests\Unit;

use App\Models\Booking;
use Tests\TestCase;

class BookingFinalPriceTest extends TestCase
{
    private function booking(array $attrs = []): Booking
    {
        return (new Booking)->forceFill($attrs + [
            'price' => 500_000, 'discount' => 50_000, 'points_used' => 40,
            'surcharge' => 30_000, 'collection_fee' => 20_000, 'points_refunded_at' => null,
        ]);
    }

    public function test_final_price_subtracts_unrefunded_points(): void
    {
        $this->assertSame(460_000, $this->booking()->finalPrice());
    }

    public function test_final_price_ignores_refunded_points(): void
    {
        $this->assertSame(500_000, $this->booking(['points_refunded_at' => '2026-10-19 10:00:00'])->finalPrice());
    }
}
