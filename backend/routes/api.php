<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\OtpController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Customer\BookingController;
use App\Http\Controllers\Customer\VoucherController;
use App\Http\Controllers\Driver\TripController;
use App\Http\Controllers\Driver\WalletController;
use App\Http\Controllers\Driver\ProfileController;
use App\Http\Controllers\Driver\StatusController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DriverController;
use App\Http\Controllers\Admin\AdminVoucherController;
use App\Http\Controllers\Admin\RevenueController;

// ── Public ────────────────────────────────────────────────────────────────────
Route::post('/auth/otp/send',   [OtpController::class, 'send']);
Route::post('/auth/otp/verify', [OtpController::class, 'verify']);

// ── Authenticated ─────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me',      [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Customer
    Route::middleware('role:customer')->group(function () {
        Route::get('/bookings',                  [BookingController::class, 'index']);
        Route::post('/bookings',                 [BookingController::class, 'store']);
        Route::get('/bookings/{booking}',        [BookingController::class, 'show']);
        Route::patch('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::post('/vouchers/apply',           [VoucherController::class, 'apply']);
    });

    // Driver
    Route::middleware('role:driver')->group(function () {
        Route::get('/driver/trips',                      [TripController::class, 'index']);
        Route::post('/driver/trips/{booking}/accept',    [TripController::class, 'accept']);
        Route::patch('/driver/trips/{booking}/status',   [TripController::class, 'updateStatus']);
        Route::get('/driver/wallet',                     [WalletController::class, 'show']);
        Route::get('/driver/wallet/transactions',        [WalletController::class, 'transactions']);
        Route::get('/driver/profile',                    [ProfileController::class, 'show']);
        Route::put('/driver/profile',                    [ProfileController::class, 'update']);
        Route::patch('/driver/status',                   [StatusController::class, 'update']);
    });

    // Admin
    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/dashboard',                        [DashboardController::class, 'index']);
        Route::get('/admin/drivers',                          [DriverController::class, 'index']);
        Route::patch('/admin/drivers/{user}/block',           [DriverController::class, 'block']);
        Route::patch('/admin/drivers/{user}/approve',         [DriverController::class, 'approve']);
        Route::get('/admin/vouchers',                         [AdminVoucherController::class, 'index']);
        Route::post('/admin/vouchers',                        [AdminVoucherController::class, 'store']);
        Route::patch('/admin/vouchers/{voucher}/deactivate',  [AdminVoucherController::class, 'deactivate']);
        Route::get('/admin/revenue',                          [RevenueController::class, 'index']);
    });
});
