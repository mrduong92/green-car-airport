<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Jobs\BroadcastFreeRidesSignal;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use App\Services\Zalo\ZaloRideIngestService;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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

        $monitor->recordHeartbeat($data);

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
        ]);

        $now = now();
        $rows = array_map(fn (array $g) => [
            'zalo_group_id' => $g['zalo_group_id'],
            'name' => mb_substr((string) ($g['name'] ?? ''), 0, 255),
            'last_message_at' => isset($g['last_message_at']) ? Carbon::createFromTimestampMs($g['last_message_at']) : null,
            'messages_24h' => $g['messages_24h'],
            'created_at' => $now,
            'updated_at' => $now,
        ], $data['groups']);

        // Không đưa 'enabled' vào cột cập nhật: cờ do admin quản lý.
        ZaloGroup::upsert($rows, ['zalo_group_id'], ['name', 'last_message_at', 'messages_24h', 'updated_at']);

        return response()->json(['stored' => count($rows)]);
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
