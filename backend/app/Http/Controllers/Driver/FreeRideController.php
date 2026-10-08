<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\DriverHiddenSender;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

// Tab Free: cuốc lấy từ nhóm Zalo. GreenCA chỉ là trung gian — "Nhận cuốc" mở Zalo người bắn.
class FreeRideController extends Controller
{
    private const PAGE_SIZE = 30;

    private const SINCE_LIMIT = 200;

    private const TZ = 'Asia/Ho_Chi_Minh';

    // Mã QR chỉ gồm chữ/số — giai đoạn 2 đã lọc lúc ingest, đây là lớp phòng thủ.
    private const SAFE_CODE_REGEX = '/^[A-Za-z0-9]+$/';

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['nullable', 'in:to_airport,from_airport,other'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:60'],
            'window' => ['nullable', 'in:2h,today,tomorrow'],
            'q' => ['nullable', 'string', 'max:100'],
            'since' => ['nullable', 'integer', 'min:0'],
            'cursor' => ['nullable', 'string'],
        ]);

        // Lấy mốc trước khi truy vấn: cuốc chèn trong lúc truy vấn sẽ rơi vào lần since kế tiếp.
        $latestBefore = FreeRide::max('updated_at');
        $query = $this->visibleTo($request->user()->id, $data);

        if (isset($data['since'])) {
            // >= vì updated_at chỉ chính xác tới giây; client gộp theo ride_uid nên trả trùng không sao.
            $rides = $query->where('updated_at', '>=', Carbon::createFromTimestampMs($data['since']))
                ->orderByDesc('updated_at')->limit(self::SINCE_LIMIT)->get();

            return response()->json([
                'data' => $this->safe($rides)->map(fn (FreeRide $r) => $this->format($r))->values(),
                'next_cursor' => null,
                'latest' => $this->latestOf($rides, (int) $data['since']),
                // Chạm giới hạn SINCE_LIMIT nghĩa là còn cuốc cũ hơn bị bỏ sót (sắp xếp mới nhất
                // trước rồi cắt) — báo client nạp lại trang 1 thay vì coi since là đã đủ.
                'reset' => $rides->count() >= self::SINCE_LIMIT,
            ]);
        }

        $page = $query->orderByDesc('posted_at')->orderByDesc('id')->cursorPaginate(self::PAGE_SIZE);

        return response()->json([
            'data' => $this->safe(collect($page->items()))->map(fn (FreeRide $r) => $this->format($r))->values(),
            'next_cursor' => $page->nextCursor()?->encode(),
            'latest' => $latestBefore ? Carbon::parse($latestBefore)->getTimestampMs() : null,
        ]);
    }

    public function report(Request $request, string $rideUid): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'in:spam,wrong_info,inappropriate,other'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $ride = FreeRide::where('ride_uid', $rideUid)->firstOrFail();

        FreeRideReport::updateOrCreate(
            ['driver_id' => $request->user()->id, 'free_ride_uid' => $ride->ride_uid],
            ['sender_uid' => $ride->sender_uid, 'reason' => $data['reason'], 'note' => $data['note'] ?? null],
        );

        return response()->json(['ok' => true]);
    }

    public function hideSender(Request $request): JsonResponse
    {
        $data = $request->validate(['sender_uid' => ['required', 'string', 'max:32']]);

        DriverHiddenSender::firstOrCreate(['driver_id' => $request->user()->id, 'sender_uid' => $data['sender_uid']]);

        return response()->json(['ok' => true]);
    }

    public function brokenLink(Request $request, string $rideUid): JsonResponse
    {
        $ride = FreeRide::where('ride_uid', $rideUid)->firstOrFail();

        // Một yêu cầu chưa giao cho mỗi người bắn là đủ — service lấy lại mã một lần.
        $pending = ZaloQrRefreshRequest::where('sender_uid', $ride->sender_uid)->whereNull('delivered_at')->exists();
        if (! $pending) {
            ZaloQrRefreshRequest::create(['sender_uid' => $ride->sender_uid, 'requested_by' => $request->user()->id]);
        }

        return response()->json(['ok' => true]);
    }

    private function visibleTo(int $driverId, array $data): Builder
    {
        $query = FreeRide::query()
            ->where('expires_at', '>', now())
            ->whereNotIn('sender_uid', ZaloSenderBlock::select('sender_uid'))
            // Nhóm admin đã tắt: ẩn cả cuốc đã đồng bộ trước khi tắt / lúc service chưa lấy được cấu hình.
            ->whereNotIn('zalo_group_id', ZaloGroup::where('enabled', false)->select('zalo_group_id'))
            ->whereNotIn('sender_uid', DriverHiddenSender::where('driver_id', $driverId)->select('sender_uid'))
            // Mã QR bẩn: không lọc ở DB (REGEXP không có trên mọi driver, vd. SQLite test) — giai
            // đoạn 2 đã chặn mã bẩn lúc ingest, và safe() lọc lại ở PHP như lớp phòng thủ cuối,
            // chạy giống nhau trên mọi driver và có test bao phủ đầy đủ.
            ->when($data['direction'] ?? null, fn (Builder $q, string $d) => $q->where('direction', $d))
            ->when($data['seats'] ?? null, fn (Builder $q, $s) => $q->where('seats', (int) $s));

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn (Builder $w) => $w->where('pickup', 'like', $like)
                ->orWhere('destination', 'like', $like)
                ->orWhere('raw_text', 'like', $like));
        }

        $nowVn = now(self::TZ);
        match ($data['window'] ?? null) {
            '2h' => $query->whereBetween('pickup_at', [now()->subMinutes(30), now()->addHours(2)]),
            'today' => $query->whereBetween('pickup_at', [now()->subMinutes(30), $nowVn->copy()->endOfDay()->utc()]),
            'tomorrow' => $query->whereBetween('pickup_at', [$nowVn->copy()->addDay()->startOfDay()->utc(), $nowVn->copy()->addDay()->endOfDay()->utc()]),
            default => null,
        };

        return $query;
    }

    // Phòng thủ: loại cuốc có qr_code không phải thuần chữ/số. Giai đoạn 2 đã chặn mã bẩn lúc
    // ingest nên đây gần như không khớp gì — lọc ở PHP (không phải DB) để chạy giống nhau trên
    // mọi driver, kể cả SQLite (test) không có REGEXP.
    private function safe(Collection $rides): Collection
    {
        return $rides->filter(fn (FreeRide $r) => preg_match(self::SAFE_CODE_REGEX, $r->qr_code) === 1);
    }

    private function format(FreeRide $r): array
    {
        return [
            'ride_uid' => $r->ride_uid,
            'sender_uid' => $r->sender_uid,
            'sender_name' => $r->sender_name,
            'group_name' => $r->group_name,
            'direction' => $r->direction,
            'pickup' => $r->pickup,
            'destination' => $r->destination,
            'pickup_at' => $r->pickup_at?->getTimestampMs(),
            'pickup_time_text' => $r->pickup_time_text,
            'seats' => $r->seats,
            'vehicle_note' => $r->vehicle_note,
            'price' => $r->price,
            'is_free' => $r->is_free,
            'is_raw' => $r->is_raw,
            'raw_text' => $r->raw_text,
            'group_count' => $r->group_count,
            'contact_url' => "zalo://qr/p/{$r->qr_code}",
            'posted_at' => $r->posted_at->getTimestampMs(),
            'expires_at' => $r->expires_at->getTimestampMs(),
        ];
    }

    private function latestOf(Collection $rides, int $fallback): int
    {
        $max = $rides->max(fn (FreeRide $r) => $r->updated_at->getTimestampMs());

        return $max ?? $fallback;
    }
}
