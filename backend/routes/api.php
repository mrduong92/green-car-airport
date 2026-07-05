<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\OtpController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Customer\BookingController;
use App\Http\Controllers\Customer\CustomerProfileController;
use App\Http\Controllers\Customer\VoucherController;
use App\Http\Controllers\Driver\TripController;
use App\Http\Controllers\Driver\WalletController;
use App\Http\Controllers\Driver\ProfileController;
use App\Http\Controllers\Driver\StatusController;
use App\Http\Controllers\Driver\StreamController;
use App\Http\Controllers\Customer\StreamController as CustomerStreamController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DriverController;
use App\Http\Controllers\Admin\CustomerController as AdminCustomerController;
use App\Http\Controllers\Admin\AdminVoucherController;
use App\Http\Controllers\Admin\AdminWalletController;
use App\Http\Controllers\Admin\RevenueController;
use App\Http\Controllers\Customer\CollaboratorWalletController;
use App\Http\Controllers\Admin\PriceConfigController as AdminPriceConfigController;
use App\Http\Controllers\Admin\ZnsController as AdminZnsController;
use App\Http\Controllers\PriceConfigController;
use App\Http\Controllers\StaticPageController;
use App\Http\Controllers\Admin\StaticPageController as AdminStaticPageController;
use App\Http\Controllers\DeviceTokenController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\Webhooks\SepayWebhookController;
use App\Http\Controllers\ZnsDlrController;

// ── SSE (manual token auth inside controller) ─────────────────────────────────
Route::get('/driver/stream',   [StreamController::class,         'trips']);
Route::get('/customer/stream', [CustomerStreamController::class, 'bookings']);

// ── Public ────────────────────────────────────────────────────────────────────
Route::post('/auth/otp/send',      [OtpController::class,  'send']);
Route::post('/auth/otp/verify',    [OtpController::class,  'verify']);
Route::post('/auth/check-phone',   [AuthController::class, 'checkPhone']);
Route::post('/auth/login',         [AuthController::class, 'login']);
Route::post('/auth/register',         [AuthController::class, 'register']);
Route::post('/auth/register/driver',  [AuthController::class, 'registerDriver']);
Route::post('/auth/reset-password',[AuthController::class, 'resetPassword']);
Route::get('/price-configs',    [PriceConfigController::class, 'index']);
Route::get('/pages/{slug}',     [StaticPageController::class, 'show']);
Route::post('/webhooks/sepay',  [SepayWebhookController::class, 'handle']);
Route::get('/zns/dlr',          [ZnsDlrController::class, 'handle']);

// ── Authenticated ─────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me',      [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Shared (any authenticated role)
    Route::post('/device-token',   [DeviceTokenController::class, 'store']);
    Route::delete('/device-token', [DeviceTokenController::class, 'destroy']);
    Route::get('/notifications',             [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/notifications/read-all',   [NotificationController::class, 'readAll']);
    Route::patch('/notifications/{id}/read',  [NotificationController::class, 'markRead']);

    // Customer
    Route::middleware('role:customer')->group(function () {
        Route::get('/customer/profile',          [CustomerProfileController::class, 'show']);
        Route::patch('/customer/profile',        [CustomerProfileController::class, 'update']);
        Route::get('/bookings',                  [BookingController::class, 'index']);
        Route::post('/bookings',                 [BookingController::class, 'store']);
        Route::get('/bookings/active',           [BookingController::class, 'active']);
        Route::get('/bookings/{booking}',        [BookingController::class, 'show']);
        Route::patch('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::get('/customer/vouchers',         [VoucherController::class, 'index']);
        Route::get('/customer/my-vouchers',      [VoucherController::class, 'myVouchers']);
        Route::post('/customer/vouchers/apply',  [VoucherController::class, 'apply']);
        Route::get('/customer/collaborator/wallet',              [CollaboratorWalletController::class, 'show']);
        Route::get('/customer/collaborator/wallet/transactions', [CollaboratorWalletController::class, 'transactions']);
    });

    // Driver
    Route::middleware('role:driver')->group(function () {
        Route::get('/driver/trips',                      [TripController::class, 'index']);
        Route::get('/driver/trips/mine',                 [TripController::class, 'mine']);
        Route::get('/driver/trips/history',              [TripController::class, 'history']);
        Route::post('/driver/trips/{booking}/accept',    [TripController::class, 'accept']);
        Route::patch('/driver/trips/{booking}/status',   [TripController::class, 'updateStatus']);
        Route::patch('/driver/trips/{booking}/cancel',   [TripController::class, 'cancel']);
        Route::get('/driver/wallet',                     [WalletController::class, 'show']);
        Route::get('/driver/wallet/transactions',        [WalletController::class, 'transactions']);
        Route::get('/driver/wallet/topup-info',          [WalletController::class, 'topupInfo']);
        Route::get('/driver/wallet/topups',              [WalletController::class, 'topups']);
        Route::get('/driver/profile',                    [ProfileController::class, 'show']);
        Route::put('/driver/profile',                    [ProfileController::class, 'update']);
        Route::patch('/driver/status',                   [StatusController::class, 'update']);
    });

    // Admin
    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/dashboard',                        [DashboardController::class, 'index']);
        Route::post('/admin/dashboard/clear-cache',           [DashboardController::class, 'clearCache']);
        Route::get('/admin/drivers',                          [DriverController::class, 'index']);
        Route::put('/admin/drivers/{user}',                   [DriverController::class, 'update']);
        Route::patch('/admin/drivers/{user}/block',           [DriverController::class, 'block']);
        Route::patch('/admin/drivers/{user}/unblock',         [DriverController::class, 'unblock']);
        Route::patch('/admin/drivers/{user}/approve',         [DriverController::class, 'approve']);
        Route::get('/admin/vouchers',                         [AdminVoucherController::class, 'index']);
        Route::post('/admin/vouchers',                        [AdminVoucherController::class, 'store']);
        Route::patch('/admin/vouchers/{voucher}/deactivate',  [AdminVoucherController::class, 'deactivate']);
        Route::get('/admin/revenue',                          [RevenueController::class, 'index']);
        Route::get('/admin/customers',                        [AdminCustomerController::class, 'index']);
        Route::patch('/admin/customers/{user}',               [AdminCustomerController::class, 'update']);
        Route::get('/admin/customers/{user}/bookings',        [AdminCustomerController::class, 'bookings']);
        Route::patch('/admin/customers/{user}/block',         [AdminCustomerController::class, 'block']);
        Route::patch('/admin/customers/{user}/unblock',       [AdminCustomerController::class, 'unblock']);
        Route::patch('/admin/customers/{user}/collaborator',  [AdminCustomerController::class, 'toggleCollaborator']);
        Route::post('/admin/drivers/{user}/topup',            [AdminWalletController::class, 'topup']);
        Route::apiResource('/admin/price-configs', AdminPriceConfigController::class)->except(['show']);
        Route::apiResource('/admin/pages', AdminStaticPageController::class)->except(['show']);
        Route::get('/admin/zns/balance', [AdminZnsController::class, 'balance']);
    });
});
