<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Services\Zalo\ZaloRideIngestService;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        ]);

        $monitor->recordHeartbeat($data);

        return response()->json(['ok' => true]);
    }

    public function rides(Request $request, ZaloRideIngestService $service): JsonResponse
    {
        $data = $request->validate([
            'rides' => ['required', 'array', 'max:'.config('zalo.max_rides_batch')],
        ]);

        return response()->json($service->ingest($data['rides']));
    }
}
