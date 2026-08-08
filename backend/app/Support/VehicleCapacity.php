<?php

namespace App\Support;

/**
 * Quy tắc "xe nào chở được cuốc nào" — NGUỒN DUY NHẤT.
 *
 * Trước đây quy tắc này nằm private trong TripController, nên
 * SendNewBookingBroadcastJob không có cách nào dùng lại và đã bắn push cho
 * MỌI tài xế online: tài xế xe 4 chỗ nhận noti cuốc 5 chỗ, bấm vào thì danh
 * sách rỗng vì TripController::index() có lọc. Thêm chỗ nào cần lọc theo sức
 * chứa thì dùng class này, đừng chép lại logic.
 */
class VehicleCapacity
{
    /** Số chỗ của từng loại xe. Khớp enum `bookings.vehicle_type`. */
    public const RANK = [
        'sedan_4' => 4,
        'suv_5'   => 5,
        'mpv_7'   => 7,
    ];

    /**
     * Các loại cuốc mà tài xế lái $driverType nhận được.
     * Xe không rõ loại → cho phép tất cả (khớp nhánh phòng thủ của fits()).
     *
     * @return list<string>
     */
    public static function bookingTypesFittingDriver(?string $driverType): array
    {
        if (! $driverType || ! isset(self::RANK[$driverType])) {
            return array_keys(self::RANK);
        }

        $driverRank = self::RANK[$driverType];

        return array_keys(array_filter(self::RANK, fn (int $rank) => $rank <= $driverRank));
    }

    /**
     * Chiều NGƯỢC LẠI: các loại xe chở được cuốc $bookingType — dùng để lọc
     * tài xế khi gửi push.
     *
     * Cuốc không rõ loại → trả về mọi loại xe, để không ai bị bỏ sót noti.
     *
     * @return list<string>
     */
    public static function driverTypesFittingBooking(?string $bookingType): array
    {
        if (! $bookingType || ! isset(self::RANK[$bookingType])) {
            return array_keys(self::RANK);
        }

        $bookingRank = self::RANK[$bookingType];

        return array_keys(array_filter(self::RANK, fn (int $rank) => $rank >= $bookingRank));
    }

    /** Tài xế lái $driverType có nhận được cuốc $bookingType không. */
    public static function fits(?string $bookingType, ?string $driverType): bool
    {
        if (! $driverType || ! isset(self::RANK[$driverType])) {
            return true;
        }

        return (self::RANK[$bookingType] ?? 0) <= self::RANK[$driverType];
    }
}
