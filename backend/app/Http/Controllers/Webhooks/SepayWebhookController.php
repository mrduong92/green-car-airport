<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Services\SepayWebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SepayWebhookController extends Controller
{
    public function __construct(private SepayWebhookService $service) {}

    public function handle(Request $request): JsonResponse
    {
        if (! $this->verifyApiKey($request)) {
            return response()->json(['success' => false, 'error' => 'unauthorized'], 401);
        }

        $payload = $request->all();

        if (! is_array($payload) || ! isset($payload['id']) || ! isset($payload['transferType'])) {
            return response()->json(['success' => false, 'error' => 'invalid_payload'], 400);
        }

        try {
            $this->service->process($payload);
        } catch (\Throwable $e) {
            Log::error('Sepay webhook processing failed', [
                'error' => $e->getMessage(),
                'sepay_id' => $payload['id'] ?? null,
            ]);
            // Vẫn return 200 để Sepay không retry — sự cố sẽ được xem trong log
            // (Idempotency vẫn được bảo vệ bởi UNIQUE sepay_id)
        }

        return response()->json(['success' => true]);
    }

    private function verifyApiKey(Request $request): bool
    {
        $expected = (string) config('sepay.api_key', '');
        if ($expected === '') {
            return false;
        }

        $header = (string) $request->header('Authorization', '');
        if ($header === '') {
            return false;
        }

        // Sepay gửi: "Authorization: Apikey <KEY>"
        $prefix = 'Apikey ';
        if (! str_starts_with($header, $prefix)) {
            return false;
        }

        $provided = trim(substr($header, strlen($prefix)));

        return hash_equals($expected, $provided);
    }
}
