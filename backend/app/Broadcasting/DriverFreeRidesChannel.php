<?php

namespace App\Broadcasting;

use App\Models\User;

// Kênh tab Free: chỉ tài xế đã duyệt (khớp middleware driver.active của API).
class DriverFreeRidesChannel
{
    public function join(User $user): bool
    {
        return $user->role === 'driver' && $user->driverProfile?->status === 'active';
    }
}
