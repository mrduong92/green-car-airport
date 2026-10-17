<?php

namespace App\Jobs;

use App\Models\FreeRide;
use App\Services\RideParser\OpenAiRideParser;
use App\Services\RideParser\RideParseFailed;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Tách cuốc tài xế đăng bằng AI ở nền: điền chiều/giờ/số chỗ/giá để lọc + cảnh báo đẩy. Thẻ cuốc vẫn hiện
 * nguyên văn tin (is_raw) — AI hỏng thì cuốc vẫn sống, chỉ không lọc được (parse_status=failed).
 */
class ParseDriverRide implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;

    public int $timeout = 30;

    public function __construct(public readonly int $rideId) {}

    public function handle(OpenAiRideParser $parser): void
    {
        $ride = FreeRide::find($this->rideId);
        if (! $ride || $ride->parse_status !== 'pending' || $ride->closed_at !== null) {
            return;
        }

        try {
            $draft = $parser->parse($ride->raw_text, $ride->posted_at);
        } catch (RideParseFailed $e) {
            Log::warning('ride_parser.failed', ['ride_id' => $ride->id, 'user_id' => $ride->posted_by_user_id, 'reason' => $e->getMessage()]);
            $draft = null;
        }

        if ($draft === null) {
            $ride->update(['parse_status' => 'failed']);
        } else {
            // Eloquent ghi Carbon theo múi giờ của chính nó, không đổi sang app timezone — PickupTime trả mốc
            // UTC, nên phải đổi trước khi lưu, nếu không giờ đón/hết hạn lệch 7 tiếng.
            $tz = config('app.timezone');
            $pickupAt = $draft->pickupAt?->copy()->setTimezone($tz);
            $ride->update([
                'parse_status' => 'done',
                'direction' => $draft->direction,
                'pickup' => $draft->pickup,
                'destination' => $draft->destination,
                'pickup_at' => $pickupAt,
                'pickup_time_text' => $draft->pickupTimeText,
                'seats' => $draft->seats,
                'vehicle_note' => $draft->vehicleNote,
                'price' => $draft->price,
                'is_free' => $draft->isFree,
                'expires_at' => self::expiresAt($ride, $pickupAt)->setTimezone($tz),
            ]);
        }

        BroadcastFreeRidesSignal::dispatch()->delay(now()->addSeconds(2));
        NotifyFreeRideAlerts::dispatch()->delay(now()->addSeconds(2));
    }

    public function failed(): void
    {
        FreeRide::whereKey($this->rideId)->where('parse_status', 'pending')->update(['parse_status' => 'failed']);
        // Cuốc thôi giữ mốc cảnh báo đẩy → cho các cuốc phía sau được push ngay.
        NotifyFreeRideAlerts::dispatch()->delay(now()->addSeconds(2));
    }

    /** pickup + 30', không sớm hơn posted + 30' (AI đọc nhầm giờ đã qua), không quá posted + 7 ngày. */
    public static function expiresAt(FreeRide $ride, ?Carbon $pickupAt): Carbon
    {
        if ($pickupAt === null) {
            return $ride->expires_at;
        }
        $posted = $ride->posted_at->copy();

        return $pickupAt->copy()->addMinutes(30)->max($posted->copy()->addMinutes(30))->min($posted->copy()->addDays(7));
    }
}
