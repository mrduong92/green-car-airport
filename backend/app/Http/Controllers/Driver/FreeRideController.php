<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\DriverFreeRideAlert;
use App\Models\DriverHiddenSender;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\ZaloQrRefreshRequest;
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

        // group_count hiển thị cộng dồn các bản trùng (cùng người, nick phụ khác) — xem FreeRide::scopeWithMergedGroupCount().
        $query = $this->visibleTo($request->user()->id, $data)->withMergedGroupCount();

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

        // Lấy mốc trước khi truy vấn: cuốc chèn trong lúc truy vấn sẽ rơi vào lần since kế tiếp.
        // Chỉ nhánh trang mới cần (nhánh since tự tính mốc từ kết quả); có index trên updated_at.
        $latestBefore = FreeRide::max('updated_at');
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
        $data = $request->validate([
            'sender_uid' => ['required_without:qr_code', 'nullable', 'string', 'max:32'],
            'qr_code' => ['required_without:sender_uid', 'nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
        ]);
        $driverId = $request->user()->id;

        // Ẩn theo hồ sơ (qr_code) để mọi uid của cùng người đều biến mất — Zalo cấp uid khác nhau
        // tuỳ nick phụ. Không gửi qr_code thì suy từ cuốc mới nhất của uid; không còn cuốc nào thì
        // đành ẩn theo uid như cũ.
        $qrCode = $data['qr_code'] ?? FreeRide::where('sender_uid', $data['sender_uid'])
            ->orderByDesc('posted_at')->orderByDesc('id')->value('qr_code');

        if ($qrCode !== null) {
            DriverHiddenSender::firstOrCreate(['driver_id' => $driverId, 'qr_code' => $qrCode]);
        } else {
            DriverHiddenSender::firstOrCreate(['driver_id' => $driverId, 'sender_uid' => $data['sender_uid']]);
        }

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

    // Bộ lọc đã lưu để nhận thông báo đẩy (NotifyFreeRideAlerts) khi có cuốc Free mới khớp.
    public function alert(Request $request): JsonResponse
    {
        $alert = DriverFreeRideAlert::where('driver_id', $request->user()->id)->first();

        return response()->json($this->formatAlert($alert));
    }

    public function saveAlert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'direction' => ['nullable', 'in:to_airport,from_airport,other'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:60'],
            'keywords' => ['nullable', 'string', 'max:100'],
        ]);

        $alert = DriverFreeRideAlert::updateOrCreate(
            ['driver_id' => $request->user()->id],
            [
                'enabled' => $data['enabled'],
                'direction' => $data['direction'] ?? null,
                'seats' => $data['seats'] ?? null,
                'keywords' => $data['keywords'] ?? null,
            ],
        );

        return response()->json($this->formatAlert($alert));
    }

    private function formatAlert(?DriverFreeRideAlert $alert): array
    {
        return [
            'enabled' => (bool) ($alert->enabled ?? false),
            'direction' => $alert->direction ?? null,
            'seats' => $alert->seats ?? null,
            'keywords' => $alert->keywords ?? null,
        ];
    }

    // Điều kiện hiển thị (còn hạn, chặn/ẩn người bắn, nhóm tắt, bộ lọc) sống ở FreeRide::scopeVisibleTo()
    // để job NotifyFreeRideAlerts dùng lại y hệt — tránh lệch điều kiện giữa danh sách và cảnh báo đẩy.
    private function visibleTo(int $driverId, array $data): Builder
    {
        return FreeRide::query()->visibleTo($driverId, $data);
    }

    // Phòng thủ: loại cuốc có qr_code không phải thuần chữ/số — xem FreeRide::filterSafe().
    private function safe(Collection $rides): Collection
    {
        return FreeRide::filterSafe($rides);
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
            'group_count' => $r->displayedGroupCount(),
            // Mã hồ sơ (danh tính thật của người bắn) — tab Free gửi lại khi "Ẩn người bắn".
            'qr_code' => $r->qr_code,
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
