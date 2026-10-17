<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Jobs\BroadcastFreeRidesSignal;
use App\Jobs\ParseDriverRide;
use App\Models\FreeRide;
use App\Support\FreeRidePresenter;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Tài xế đăng cuốc vào tab Free như gửi tin Zalo: lưu ngay dạng tin nguyên văn, AI tách trường ở nền
 * (ParseDriverRide). Spec: docs/superpowers/specs/2026-10-17-driver-post-ride-design.md
 */
class RidePostController extends Controller
{
    public const DAILY_LIMIT = 20;

    // Cuốc chưa tách được giờ đón sống chừng này.
    private const DEFAULT_TTL_HOURS = 3;

    public function acceptTerms(Request $request): JsonResponse
    {
        $profile = $request->user()->driverProfile;
        if ($profile->ride_post_terms_accepted_at === null) {
            $profile->update(['ride_post_terms_accepted_at' => now()]);
        }

        return response()->json(['ok' => true]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:1000'],
            'contact_zalo' => ['sometimes', 'boolean'],
        ]);
        $user = $request->user();
        $profile = $user->driverProfile;

        if ($profile->ride_post_terms_accepted_at === null) {
            return response()->json(['message' => 'Bạn cần đồng ý Quy định đăng cuốc trước khi đăng.', 'code' => 'ride_post_terms_required'], 409);
        }

        // Đếm bằng bộ đếm theo ngày (không đếm dòng trong bảng) — xoá cuốc rồi đăng lại không lách được giới hạn.
        $counterKey = "ride_posts:{$user->id}:".now('Asia/Ho_Chi_Minh')->format('Y-m-d');
        if ((int) Cache::get($counterKey, 0) >= self::DAILY_LIMIT) {
            return response()->json(['message' => 'Bạn đã đăng '.self::DAILY_LIMIT.' cuốc hôm nay. Mai đăng tiếp nhé.', 'code' => 'daily_post_limit'], 429);
        }

        try {
            // Cùng khoá với ingest Zalo: id commit tuần tự để NotifyFreeRideAlerts không vượt qua cuốc chưa hiện.
            $ride = Cache::lock('zalo:ingest', 10)->block((int) config('zalo.ingest_lock_wait_seconds'), fn () => FreeRide::create([
                'ride_uid' => 'gca-'.Str::lower((string) Str::ulid()),
                'sender_uid' => FreeRide::driverSenderUid($user->id),
                'sender_name' => $user->name,
                'qr_code' => null,
                'zalo_group_id' => null,
                'group_name' => '',
                'posted_by_user_id' => $user->id,
                'contact_zalo' => $data['contact_zalo'] ?? true,
                'is_raw' => true,
                'is_free' => false,
                'raw_text' => FreeRide::maskPhones($data['text']),
                'group_count' => 1,
                'posted_at' => now(),
                'expires_at' => now()->addHours(self::DEFAULT_TTL_HOURS),
                'parse_status' => 'pending',
            ]));
        } catch (LockTimeoutException) {
            return response()->json(['message' => 'Hệ thống đang bận, bạn gửi lại sau giây lát.'], 503);
        }

        Cache::add($counterKey, 0, now()->addDays(2));
        Cache::increment($counterKey);

        BroadcastFreeRidesSignal::dispatch()->delay(now()->addSeconds(2));
        ParseDriverRide::dispatch($ride->id);

        return response()->json(
            FreeRidePresenter::present($ride->load('poster:id,phone'), (bool) $profile->hasFreeAccess(), FreeRidePresenter::showSettings(), $user->id),
            201,
        );
    }
}
