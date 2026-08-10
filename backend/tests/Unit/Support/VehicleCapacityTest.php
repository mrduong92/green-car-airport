<?php

// backend/tests/Unit/Support/VehicleCapacityTest.php

namespace Tests\Unit\Support;

use App\Support\VehicleCapacity;
use PHPUnit\Framework\TestCase;

class VehicleCapacityTest extends TestCase
{
    public function test_vip_booking_needs_vip_driver(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', true, true));
        $this->assertFalse(VehicleCapacity::fits('sedan_4', 'sedan_4', true, false));
    }

    public function test_vip_driver_can_take_normal_booking(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', false, true));
    }

    public function test_normal_booking_normal_driver_unchanged(): void
    {
        $this->assertTrue(VehicleCapacity::fits('sedan_4', 'sedan_4', false, false));
        $this->assertFalse(VehicleCapacity::fits('mpv_7', 'sedan_4', false, false));
    }

    /**
     * Nhánh "xe không rõ loại thì cho phép tất cả" KHÔNG được nuốt luôn điều
     * kiện VIP: tài xế chưa khai loại xe mà không phải xe cá nhân thì vẫn phải
     * bị chặn khỏi cuốc VIP.
     */
    public function test_unknown_vehicle_type_still_blocked_from_vip(): void
    {
        $this->assertTrue(VehicleCapacity::fits('mpv_7', null, false, false));
        $this->assertFalse(VehicleCapacity::fits('mpv_7', null, true, false));
        $this->assertTrue(VehicleCapacity::fits('mpv_7', null, true, true));
    }

    public function test_vip_does_not_bypass_capacity(): void
    {
        // Tài xế VIP nhưng xe 4 chỗ vẫn không chở được cuốc VIP 7 chỗ
        $this->assertFalse(VehicleCapacity::fits('mpv_7', 'sedan_4', true, true));
    }

    public function test_capacity_helpers_stay_vip_agnostic(): void
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
