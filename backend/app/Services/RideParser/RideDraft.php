<?php

namespace App\Services\RideParser;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/** Kết quả AI đã làm sạch theo giới hạn cột free_rides (giá trị ngoài khoảng → null, chữ dài → cắt). */
final class RideDraft
{
    private const DIRECTIONS = ['to_airport', 'from_airport', 'other'];

    public function __construct(
        public readonly ?string $direction,
        public readonly ?string $pickup,
        public readonly ?string $destination,
        public readonly ?Carbon $pickupAt,
        public readonly ?string $pickupTimeText,
        public readonly ?int $seats,
        public readonly ?string $vehicleNote,
        public readonly ?int $price,
        public readonly bool $isFree,
    ) {}

    public static function fromAi(array $ai, CarbonInterface $postedAt): self
    {
        $pickupAt = null;
        $time = is_string($ai['pickup_time'] ?? null) && preg_match('/^(\d{1,2}):(\d{2})$/', $ai['pickup_time'], $t) ? $t : null;
        if ($time && (int) $time[1] <= 23 && (int) $time[2] <= 59) {
            $date = is_string($ai['pickup_date'] ?? null) && preg_match('/^(\d{1,2})\/(\d{1,2})$/', $ai['pickup_date'], $d) ? $d : null;
            $validDate = $date && (int) $date[1] >= 1 && (int) $date[1] <= 31 && (int) $date[2] >= 1 && (int) $date[2] <= 12;
            $pickupAt = PickupTime::resolve($postedAt, (int) $time[1], (int) $time[2],
                $validDate ? (int) $date[1] : null, $validDate ? (int) $date[2] : null);
        }

        return new self(
            direction: in_array($ai['direction'] ?? null, self::DIRECTIONS, true) ? $ai['direction'] : null,
            pickup: self::text($ai['pickup'] ?? null, 255),
            destination: self::text($ai['destination'] ?? null, 255),
            pickupAt: $pickupAt,
            pickupTimeText: self::text($ai['pickup_time'] ?? null, 32),
            seats: self::int($ai['seats'] ?? null, 1, 60),
            vehicleNote: self::text($ai['vehicle_note'] ?? null, 32),
            price: self::int($ai['price_vnd'] ?? null, 0, 100_000_000),
            isFree: ($ai['is_free'] ?? false) === true,
        );
    }

    private static function text(mixed $v, int $max): ?string
    {
        if (! is_string($v) || trim($v) === '') {
            return null;
        }

        return mb_substr(trim($v), 0, $max);
    }

    private static function int(mixed $v, int $min, int $max): ?int
    {
        return is_int($v) && $v >= $min && $v <= $max ? $v : null;
    }
}
