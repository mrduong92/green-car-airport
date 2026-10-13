<?php

use App\Broadcasting\DriverFreeRidesChannel;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

/**
 * Kênh danh sách cuốc — mọi tài xế cùng nghe.
 *
 * Dùng private chứ KHÔNG public: bản SSE trước đây có kiểm `role !== 'driver'`
 * thì trả 401, để public là khách hàng hay người lạ cũng subscribe được và biết
 * mọi cuốc đang phát sinh trong hệ thống.
 */
Broadcast::channel('driver.trips', function ($user) {
    return $user->role === 'driver';
});

/**
 * Kênh riêng của từng khách — chỉ chính chủ mới nghe được trạng thái chuyến.
 */
Broadcast::channel('customer.{customerId}', function ($user, $customerId) {
    return (int) $user->id === (int) $customerId;
});

/**
 * Kênh tab Free — chỉ tài xế đã được duyệt (status active), khớp middleware driver.active.
 */
Broadcast::channel('driver.free-rides', DriverFreeRidesChannel::class);
