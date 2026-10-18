<?php

namespace App\Services;

use App\Events\CustomerBookingUpdated;
use App\Events\DriverTripsUpdated;
use App\Models\Booking;
use App\Models\User;
use App\Notifications\BookingMovedToStandardCarNotification;
use App\Notifications\DriverCancelledNotification;
use App\Notifications\WhitePlateTripReleasedNotification;
use App\Support\AvailableTripsCache;
use Illuminate\Support\Facades\DB;

/**
 * Gỡ cuốc VIP (xe cá nhân, biển trắng): xe biển trắng chở khách lấy tiền vi phạm quy định vận tải.
 * Dùng bởi lệnh `vip:retire` (chạy một lần lúc phát hành) và khi admin đánh dấu một xe là biển trắng.
 *
 * bookings.is_vip không còn trong model Booking — chỉ đọc/ghi qua query builder ở đây, cột sẽ bị xoá
 * sau khi lệnh đã chạy trên production.
 */
class WhitePlateRetirement
{
    // Đã nhận nhưng chưa đón khách. Cuốc đang chạy (in_progress) để chạy nốt.
    private const NOT_STARTED = ['accepted', 'picking_up'];

    /** Trả mọi cuốc chưa chạy của tài xế xe biển trắng về sàn, hoàn đủ phí app. Trả về số cuốc đã trả. */
    public function releaseDriverTrips(int $driverId): int
    {
        $released = 0;
        $ids = Booking::where('driver_id', $driverId)->whereIn('status', self::NOT_STARTED)->pluck('id');
        foreach ($ids as $id) {
            $released += $this->release($id, $driverId) ? 1 : 0;
        }

        return $released;
    }

    /** Cuốc VIP đang chờ tài xế → cuốc thường, giữ nguyên giá. Trả về số cuốc đã đổi. */
    public function convertWaitingVipBookings(): int
    {
        $ids = DB::table('bookings')->where('is_vip', true)->where('status', 'finding_driver')->pluck('id');
        foreach ($ids as $id) {
            $converted = DB::table('bookings')->where('id', $id)->where('is_vip', true)->update(['is_vip' => false]);
            if ($converted === 0) {
                continue; // lần chạy khác vừa đổi
            }
            $booking = Booking::find($id);
            CustomerBookingUpdated::dispatch($booking->customer_id, 'booking_updated', $booking->id);
            $booking->customer?->notify(new BookingMovedToStandardCarNotification($booking, released: false));
        }

        return $ids->count();
    }

    private function release(int $bookingId, int $driverId): bool
    {
        $wasVip = false;
        $booking = DB::transaction(function () use ($bookingId, $driverId, &$wasVip) {
            $booking = Booking::lockForUpdate()->find($bookingId);
            if (! $booking || $booking->driver_id !== $driverId || ! in_array($booking->status, self::NOT_STARTED, true)) {
                return null;
            }

            // Nền tảng gỡ cuốc chứ không phải tài xế tự bỏ → hoàn cả phí app.
            $booking->refundAcceptCharges('hệ thống', refundFee: true);
            $booking->update(['driver_id' => null, 'status' => 'finding_driver', 'accepted_at' => null]);
            $wasVip = DB::table('bookings')->where('id', $booking->id)->where('is_vip', true)->update(['is_vip' => false]) > 0;

            return $booking;
        });

        if ($booking === null) {
            return false;
        }

        AvailableTripsCache::flush();
        DriverTripsUpdated::dispatch('new_booking', $booking->id);
        CustomerBookingUpdated::dispatch($booking->customer_id, 'booking_cancelled_by_driver', $booking->id);
        $booking->customer?->notify($wasVip
            ? new BookingMovedToStandardCarNotification($booking, released: true)
            : new DriverCancelledNotification($booking));
        User::find($driverId)?->notify(new WhitePlateTripReleasedNotification($booking));

        return true;
    }
}
