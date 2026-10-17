<?php

namespace Tests\Unit;

use App\Services\RideParser\PickupTime;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

// Port của zalo-service/src/parser/time.ts resolvePickupAt — giờ VN (UTC+7).
class PickupTimeTest extends TestCase
{
    private function at(string $vn): Carbon
    {
        return Carbon::parse($vn, 'Asia/Ho_Chi_Minh')->utc();
    }

    public function test_same_day_future_time(): void
    {
        $this->assertTrue(PickupTime::resolve($this->at('2026-10-17 10:00'), 15, 0, null, null)->eq($this->at('2026-10-17 15:00')));
    }

    public function test_time_passed_more_than_30_minutes_rolls_to_tomorrow(): void
    {
        $this->assertTrue(PickupTime::resolve($this->at('2026-10-17 10:00'), 8, 0, null, null)->eq($this->at('2026-10-18 08:00')));
    }

    public function test_time_passed_within_30_minutes_stays_today(): void
    {
        $this->assertTrue(PickupTime::resolve($this->at('2026-10-17 10:00'), 9, 45, null, null)->eq($this->at('2026-10-17 09:45')));
    }

    public function test_explicit_date(): void
    {
        $this->assertTrue(PickupTime::resolve($this->at('2026-10-17 10:00'), 6, 30, 20, 10)->eq($this->at('2026-10-20 06:30')));
    }

    public function test_year_wrap(): void
    {
        $this->assertTrue(PickupTime::resolve($this->at('2026-12-31 22:00'), 5, 0, 2, 1)->eq($this->at('2027-01-02 05:00')));
    }
}
