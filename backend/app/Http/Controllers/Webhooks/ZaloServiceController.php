<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Jobs\BroadcastFreeRidesSignal;
use App\Models\ZaloAccountRequest;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use App\Services\Zalo\ZaloRideIngestService;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// Endpoint cho microservice Zalo (Node). Giai đoạn 2 thêm rides, groups, config.
class ZaloServiceController extends Controller
{
    public function heartbeat(Request $request, ZaloServiceMonitor $monitor): JsonResponse
    {
        $data = $request->validate([
            'service_id' => ['required', 'string', 'max:64'],
            'uptime_s' => ['required', 'integer', 'min:0'],
            'accounts' => ['present', 'array'],
            'accounts.*.id' => ['required', 'string', 'max:64'],
            'accounts.*.connected' => ['required', 'boolean'],
            // Giai đoạn 4 (trang admin "Tình trạng"): đã đăng nhập chưa + lỗi gần nhất từng nick.
            // Không giới hạn độ dài ở đây: service Node đã cắt còn 300 ký tự trước khi gửi, nhưng
            // nếu lỡ gửi dài hơn thì KHÔNG được từ chối cả gói heartbeat (service trông như đã chết
            // mà không có cảnh báo nào) — cắt bằng mb_substr bên dưới thay vì validate max.
            'accounts.*.logged_in' => ['sometimes', 'boolean'],
            'accounts.*.last_error' => ['sometimes', 'nullable', 'string'],
            // Giai đoạn 5 (tab "Nick Zalo"): tên/UID lấy 1 lần sau đăng nhập (getUserInfo của
            // chính mình), lúc đăng nhập, số nhóm hiện có. Cùng lý do không giới hạn max ở đây:
            // cắt bằng mb_substr bên dưới, không từ chối cả gói vì một trường nick dài bất thường.
            'accounts.*.zalo_uid' => ['sometimes', 'nullable', 'string'],
            'accounts.*.zalo_name' => ['sometimes', 'nullable', 'string'],
            'accounts.*.logged_in_at' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'accounts.*.groups' => ['sometimes', 'integer', 'min:0'],
            'received_total' => ['required', 'integer', 'min:0'],
            'stored_total' => ['required', 'integer', 'min:0'],
            'duplicates_total' => ['required', 'integer', 'min:0'],
            'skipped_non_text' => ['required', 'integer', 'min:0'],
            'last_message_at' => ['present', 'nullable', 'integer', 'min:0'],
            'outbox_backlog' => ['sometimes', 'integer', 'min:0'],
            'ai_queue_size' => ['sometimes', 'integer', 'min:0'],
            'ai_spent_today_usd' => ['sometimes', 'numeric', 'min:0'],
            'ai_budget_usd' => ['sometimes', 'numeric', 'min:0'],
            'qr_queue_size' => ['sometimes', 'integer', 'min:0'],
            'held_back_rides' => ['sometimes', 'integer', 'min:0'],
            'qr_ok_24h' => ['sometimes', 'integer', 'min:0'],
            'qr_empty_24h' => ['sometimes', 'integer', 'min:0'],
            'qr_error_24h' => ['sometimes', 'integer', 'min:0'],
        ]);

        foreach ($data['accounts'] as &$account) {
            if (isset($account['last_error'])) {
                $account['last_error'] = mb_substr($account['last_error'], 0, 500);
            }
            if (isset($account['zalo_uid'])) {
                $account['zalo_uid'] = mb_substr($account['zalo_uid'], 0, 64);
            }
            if (isset($account['zalo_name'])) {
                $account['zalo_name'] = mb_substr($account['zalo_name'], 0, 255);
            }
        }
        unset($account);

        $monitor->recordHeartbeat($data);

        return response()->json(['ok' => true]);
    }

    // Service hỏi mỗi 5 giây (JSON nhỏ, rỗng gần như mọi lúc) — QR Zalo sống ~1-2 phút nên
    // không đợi /config 60 giây. Chỉ trả yêu cầu 'pending': 'qr_ready' service đang tự xử lý
    // tới cùng (đã có id trong tay), không cần thấy lại ở danh sách này.
    public function accountRequests(): JsonResponse
    {
        ZaloAccountRequest::expireStale();

        $requests = ZaloAccountRequest::where('status', 'pending')
            ->oldest('id')
            ->limit(5)
            ->get(['id', 'type', 'account_id']);

        return response()->json(['requests' => $requests]);
    }

    public function updateAccountRequest(Request $request, string $id): JsonResponse
    {
        $accountRequest = ZaloAccountRequest::findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:qr_ready,done,expired,failed'],
            'qr_image' => ['sometimes', 'nullable', 'string'],
            'qr_expires_at' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'zalo_uid' => ['sometimes', 'nullable', 'string'],
            'zalo_name' => ['sometimes', 'nullable', 'string'],
            'error' => ['sometimes', 'nullable', 'string'],
        ]);

        if (! $accountRequest->canTransitionTo($data['status'])) {
            return response()->json(['message' => "Không thể chuyển từ {$accountRequest->status} sang {$data['status']}"], 409);
        }

        $update = ['status' => $data['status']];

        if ($data['status'] === 'qr_ready') {
            $update['qr_image'] = $data['qr_image'] ?? null;
            $update['qr_expires_at'] = isset($data['qr_expires_at']) ? Carbon::createFromTimestampMs($data['qr_expires_at']) : null;
        } else {
            // done | expired | failed: ảnh QR là thông tin nhạy cảm (ai quét cũng đăng nhập
            // nick của người quét) — xoá ngay khi không còn cần hiển thị cho admin nữa.
            $update['qr_image'] = null;
            $update['qr_expires_at'] = null;
        }

        if (array_key_exists('zalo_uid', $data)) {
            $update['zalo_uid'] = $data['zalo_uid'] !== null ? mb_substr($data['zalo_uid'], 0, 64) : null;
        }
        if (array_key_exists('zalo_name', $data)) {
            $update['zalo_name'] = $data['zalo_name'] !== null ? mb_substr($data['zalo_name'], 0, 255) : null;
        }
        if (array_key_exists('error', $data)) {
            $update['error'] = $data['error'] !== null ? mb_substr($data['error'], 0, 500) : null;
        }

        $accountRequest->update($update);

        return response()->json(['ok' => true]);
    }

    public function rides(Request $request, ZaloRideIngestService $service): JsonResponse
    {
        $data = $request->validate([
            'rides' => ['required', 'array', 'max:'.config('zalo.max_rides_batch')],
        ]);

        $result = $service->ingest($data['rides']);
        if ($result['stored'] > 0) {
            BroadcastFreeRidesSignal::dispatch()->delay(now()->addSeconds(2));
        }

        return response()->json($result);
    }

    public function groups(Request $request): JsonResponse
    {
        $data = $request->validate([
            'groups' => ['required', 'array', 'max:2000'],
            'groups.*.zalo_group_id' => ['required', 'string', 'max:32'],
            'groups.*.name' => ['nullable', 'string'],
            'groups.*.last_message_at' => ['nullable', 'integer', 'min:0'],
            'groups.*.messages_24h' => ['required', 'integer', 'min:0'],
            // Giai đoạn 4: 3 trường tuỳ chọn (payload cũ không có) — số thành viên, nick đang ở, đã rời nhóm chưa.
            'groups.*.member_count' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'groups.*.accounts' => ['sometimes', 'array', 'max:50'],
            'groups.*.accounts.*' => ['string', 'max:64'],
            'groups.*.left' => ['sometimes', 'boolean'],
        ]);

        $now = now();
        $legacyRows = [];

        DB::transaction(function () use ($data, $now, &$legacyRows) {
            foreach ($data['groups'] as $g) {
                $base = [
                    'name' => mb_substr((string) ($g['name'] ?? ''), 0, 255),
                    'last_message_at' => isset($g['last_message_at']) ? Carbon::createFromTimestampMs($g['last_message_at']) : null,
                    'messages_24h' => $g['messages_24h'],
                    'updated_at' => $now,
                ];

                // Payload cũ không có member_count/accounts/left — gom lại, upsert hàng loạt như trước, không đụng cột scan mới.
                $hasScanFields = array_key_exists('member_count', $g) || array_key_exists('accounts', $g) || array_key_exists('left', $g);
                if (! $hasScanFields) {
                    $legacyRows[] = array_merge(['zalo_group_id' => $g['zalo_group_id'], 'created_at' => $now], $base);

                    continue;
                }

                $existing = ZaloGroup::where('zalo_group_id', $g['zalo_group_id'])->first();
                $left = (bool) ($g['left'] ?? false);
                // left=true: giữ nguyên left_at cũ nếu đã rời từ trước, mốc now() nếu mới rời; left=false: về lại null.
                $leftAt = $left ? ($existing?->left_at ?? $now) : null;

                // Không bao giờ đưa 'enabled' vào dữ liệu ghi: cờ do admin quản lý, service không được ghi đè.
                ZaloGroup::updateOrCreate(
                    ['zalo_group_id' => $g['zalo_group_id']],
                    array_merge($base, [
                        'member_count' => array_key_exists('member_count', $g) ? $g['member_count'] : $existing?->member_count,
                        'accounts' => array_key_exists('accounts', $g) ? $g['accounts'] : ($existing?->accounts ?? []),
                        'left_at' => $leftAt,
                    ])
                );
            }

            if ($legacyRows !== []) {
                // Không đưa 'enabled' vào cột cập nhật: cờ do admin quản lý.
                ZaloGroup::upsert($legacyRows, ['zalo_group_id'], ['name', 'last_message_at', 'messages_24h', 'updated_at']);
            }
        });

        return response()->json(['stored' => count($data['groups'])]);
    }

    public function config(): JsonResponse
    {
        $requests = ZaloQrRefreshRequest::whereNull('delivered_at')->get(['id', 'sender_uid']);
        if ($requests->isNotEmpty()) {
            ZaloQrRefreshRequest::whereIn('id', $requests->pluck('id'))->update(['delivered_at' => now()]);
        }

        return response()->json([
            'disabled_group_ids' => ZaloGroup::where('enabled', false)->pluck('zalo_group_id')->values()->all(),
            'blocked_sender_uids' => ZaloSenderBlock::pluck('sender_uid')->values()->all(),
            'qr_refresh_uids' => $requests->pluck('sender_uid')->unique()->values()->all(),
            'ai_daily_budget_usd' => (float) config('zalo.ai_daily_budget_usd'),
        ]);
    }
}
