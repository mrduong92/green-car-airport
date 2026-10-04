<?php

namespace App\Services\Zalo;

use App\Models\FreeRide;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * Lưu lô cuốc sạch từ microservice Zalo. Upsert theo ride_uid: service gửi lại (retry, cuốc đổi
 * group_count / qr_code) thì cập nhật, không nhân đôi. Cuốc hỏng bị loại riêng, không hỏng cả lô
 * (ghi Log::warning kèm lỗi validate). Chữ quá dài thì cắt, không loại.
 *
 * Người đăng không có mã QR đã bị service lọc bỏ trước khi gửi sang — mọi cuốc tới đây đều phải
 * có qr_code hợp lệ, nên trường này là required (không nullable).
 */
class ZaloRideIngestService
{
    private const COLUMNS = [
        'sender_uid', 'sender_name', 'qr_code', 'zalo_group_id', 'group_name', 'direction', 'pickup', 'destination',
        'pickup_at', 'pickup_time_text', 'seats', 'vehicle_note', 'price', 'is_free', 'is_raw', 'raw_text',
        'group_count', 'posted_at', 'expires_at', 'updated_at',
    ];

    /** @return array{stored: int, rejected: list<int>} */
    public function ingest(array $items): array
    {
        $now = now();
        $rows = [];
        $rejected = [];
        $errors = [];

        foreach ($items as $i => $item) {
            $v = Validator::make(is_array($item) ? $item : [], [
                'ride_uid' => ['required', 'string', 'max:64'],
                'sender_uid' => ['required', 'string', 'max:32'],
                'sender_name' => ['nullable', 'string'],
                'qr_code' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]+$/'],
                'zalo_group_id' => ['required', 'string', 'max:32'],
                'group_name' => ['nullable', 'string'],
                'direction' => ['nullable', 'in:to_airport,from_airport,other'],
                'pickup' => ['nullable', 'string'],
                'destination' => ['nullable', 'string'],
                'pickup_at' => ['nullable', 'integer', 'min:0'],
                'pickup_time_text' => ['nullable', 'string'],
                'seats' => ['nullable', 'integer', 'min:1', 'max:60'],
                'vehicle_note' => ['nullable', 'string'],
                // Giới hạn theo cột: price unsignedInteger, group_count unsignedSmallInteger — vượt thì MySQL
                // báo lỗi cả câu upsert (mất cả lô), nên loại riêng cuốc đó ở đây.
                'price' => ['nullable', 'integer', 'min:0', 'max:4294967295'],
                'is_free' => ['required', 'boolean'],
                'is_raw' => ['required', 'boolean'],
                'raw_text' => ['required', 'string'],
                'group_count' => ['required', 'integer', 'min:1', 'max:65535'],
                'posted_at' => ['required', 'integer', 'min:0'],
                'expires_at' => ['required', 'integer', 'min:0'],
            ]);
            if ($v->fails()) {
                $rejected[] = $i;
                $errors[$i] = $v->errors()->toArray();

                continue;
            }
            $d = $v->validated();

            $rows[] = [
                'ride_uid' => $d['ride_uid'],
                'sender_uid' => $d['sender_uid'],
                'sender_name' => mb_substr((string) ($d['sender_name'] ?? ''), 0, 255),
                'qr_code' => $d['qr_code'],
                'zalo_group_id' => $d['zalo_group_id'],
                'group_name' => mb_substr((string) ($d['group_name'] ?? ''), 0, 255),
                'direction' => $d['direction'] ?? null,
                'pickup' => isset($d['pickup']) ? mb_substr($d['pickup'], 0, 255) : null,
                'destination' => isset($d['destination']) ? mb_substr($d['destination'], 0, 255) : null,
                'pickup_at' => isset($d['pickup_at']) ? Carbon::createFromTimestampMs($d['pickup_at']) : null,
                'pickup_time_text' => isset($d['pickup_time_text']) ? mb_substr($d['pickup_time_text'], 0, 32) : null,
                'seats' => $d['seats'] ?? null,
                'vehicle_note' => isset($d['vehicle_note']) ? mb_substr($d['vehicle_note'], 0, 32) : null,
                'price' => $d['price'] ?? null,
                'is_free' => (bool) $d['is_free'],
                'is_raw' => (bool) $d['is_raw'],
                'raw_text' => mb_substr($d['raw_text'], 0, 4000),
                'group_count' => $d['group_count'],
                'posted_at' => Carbon::createFromTimestampMs($d['posted_at']),
                'expires_at' => Carbon::createFromTimestampMs($d['expires_at']),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // Service đánh dấu cuốc bị loại là đã gửi (gửi lại cũng bị loại) → phải để lại dấu vết ở đây.
        if ($errors !== []) {
            Log::warning('Zalo: loại '.count($errors).' cuốc không hợp lệ từ service', ['rejected' => $errors]);
        }

        if ($rows !== []) {
            FreeRide::upsert($rows, ['ride_uid'], self::COLUMNS);
        }

        return ['stored' => count($rows), 'rejected' => $rejected];
    }
}
