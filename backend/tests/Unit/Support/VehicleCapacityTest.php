<?php

// backend/tests/Unit/Support/VehicleCapacityTest.php

namespace Tests\Unit\Support;

use App\Support\VehicleCapacity;
use PHPUnit\Framework\TestCase;

class VehicleCapacityTest extends TestCase
{
    public function test_capacity_by_vehicle_type(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4'));
        $this->assertFalse(VehicleCapacity::fits('mpv_7', 'sedan_4'));
    }

    // Xe chưa khai loại (cột nullable, tài xế cũ bỏ trống) thì cho phép tất cả.
    public function test_unknown_vehicle_type_allows_all(): void
    {
        $this->assertTrue(VehicleCapacity::fits('mpv_7', null));
    }

    public function test_capacity_helpers(): void
    {
        $this->assertEquals(
            ['sedan_4', 'suv_5'],
            VehicleCapacity::bookingTypesFittingDriver('suv_5'),
        );
        $this->assertEquals(
            ['suv_5', 'mpv_7'],
            VehicleCapacity::driverTypesFittingBooking('suv_5'),
        );
    }
}
