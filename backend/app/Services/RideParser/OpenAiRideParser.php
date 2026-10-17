<?php

namespace App\Services\RideParser;

use Carbon\CarbonInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** Gọi OpenAI Chat Completions (json_schema strict) tách một tin tài xế đăng thành cuốc. */
class OpenAiRideParser
{
    // Model reasoning gpt-5 / -mini / -nano không nhận temperature; dùng reasoning_effort=minimal (như zalo-service).
    private const GPT5_REASONING_MODEL = '/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/';

    /** @throws RideParseFailed */
    public function parse(string $text, CarbonInterface $postedAt): ?RideDraft
    {
        $key = (string) config('services.openai.key');
        if ($key === '') {
            throw new RideParseFailed('not_configured');
        }
        $this->takeDailySlot();

        $model = (string) config('services.openai.ride_model');
        $body = [
            'model' => $model,
            'max_completion_tokens' => 2000,
            'messages' => [
                ['role' => 'system', 'content' => RidePrompt::SYSTEM],
                ['role' => 'user', 'content' => json_encode([
                    'now' => $postedAt->copy()->setTimezone('Asia/Ho_Chi_Minh')->format('Y-m-d H:i'),
                    'text' => $text,
                ], JSON_UNESCAPED_UNICODE)],
            ],
            'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => 'ride', 'strict' => true, 'schema' => RidePrompt::SCHEMA]],
        ] + (preg_match(self::GPT5_REASONING_MODEL, $model) ? ['reasoning_effort' => 'minimal'] : ['temperature' => 0]);

        try {
            $res = Http::withToken($key)->acceptJson()->timeout((int) config('services.openai.timeout', 15))
                ->post('https://api.openai.com/v1/chat/completions', $body);
        } catch (ConnectionException) {
            throw new RideParseFailed('timeout');
        }
        if (! $res->successful()) {
            throw new RideParseFailed('http_'.$res->status());
        }

        Log::info('ride_parser.usage', [
            'input_tokens' => $res->json('usage.prompt_tokens'),
            'output_tokens' => $res->json('usage.completion_tokens'),
        ]);

        $ai = json_decode((string) $res->json('choices.0.message.content'), true);
        if (! is_array($ai) || ! array_key_exists('is_ride', $ai)) {
            throw new RideParseFailed('bad_json');
        }

        return $ai['is_ride'] === true ? RideDraft::fromAi($ai, $postedAt) : null;
    }

    private function takeDailySlot(): void
    {
        $cacheKey = 'openai:ride:'.now('Asia/Ho_Chi_Minh')->format('Y-m-d');
        Cache::add($cacheKey, 0, now()->addDays(2));
        if (Cache::increment($cacheKey) > (int) config('services.openai.ride_daily_limit')) {
            throw new RideParseFailed('daily_limit');
        }
    }
}
