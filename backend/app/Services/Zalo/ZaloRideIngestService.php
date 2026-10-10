<?php

namespace App\Services\Zalo;

use App\Models\FreeRide;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * Lưu lô cuốc sạch từ microservice Zalo. Upsert theo ride_uid: service gửi lại (retry, cuốc đổi
 * group_count / qr_code) thì cập nhật, không nhân đôi. Cuốc hỏng bị loại riêng, không hỏng cả lô
 * (ghi Log::warning kèm lỗi validate). Chữ quá dài thì cắt, không loại.
 *
 * Người đăng không có mã QR đã bị service lọc bỏ trước khi gửi sang — mọi cuốc tới đây đều phải
 * có qr_code hợp lệ, nên trường này là required (không nullable).
 *
 * Gộp cuốc trùng: Zalo cấp uid khác nhau cho cùng một người tuỳ nick phụ, service khử trùng theo
 * sender_uid nên cùng một cuốc đăng ở hai nhóm (hai nick nghe) tới đây thành hai ride_uid. Cuốc MỚI
 * khớp một cuốc gốc còn hạn theo FreeRide::sameRideAs() (cùng qr_code + cùng nội dung) thì vẫn lưu
 * nhưng đánh dấu duplicate_of_id — xem markDuplicates().
 */
class ZaloRideIngestService
{
    private const COLUMNS = [
        'sender_uid', 'sender_name', 'qr_code', 'zalo_group_id', 'group_name', 'direction', 'pickup', 'destination',
        'pickup_at', 'pickup_time_text', 'seats', 'vehicle_note', 'price', 'is_free', 'is_raw', 'raw_text',
        'group_count', 'posted_at', 'expires_at', 'updated_at',
    ];

    /** @return array{stored: int, rejected: list<int>, new_ride_uids: list<string>} */
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

        // Phải biết ride_uid nào ĐÃ có trước khi upsert — NotifyFreeRideAlerts chỉ cần được xếp khi
        // có cuốc thật sự MỚI (service gửi lại / cập nhật group_count, qr_code... không tính).
        $newRideUids = [];
        if ($rows !== []) {
            $rideUids = array_column($rows, 'ride_uid');
            $existingRideUids = FreeRide::whereIn('ride_uid', $rideUids)->pluck('ride_uid')->all();
            $newRideUids = array_values(array_diff($rideUids, $existingRideUids));

            // Một giao dịch: lỗi khi đánh dấu trùng thì không để lại cuốc đã lưu mà chưa đánh dấu
            // (service gửi lại sẽ bị coi là cuốc cũ, không bao giờ được xét gộp nữa).
            DB::transaction(function () use ($rows, $rideUids, $newRideUids, $now) {
                FreeRide::upsert($rows, ['ride_uid'], self::COLUMNS);

                $this->markDuplicates($newRideUids, $now);
                $this->touchCanonicalsOf(array_values(array_diff($rideUids, $newRideUids)), $now);
            });
        }

        return ['stored' => count($rows), 'rejected' => $rejected, 'new_ride_uids' => $newRideUids];
    }

    /**
     * Cuốc mới (xét theo posted_at tăng dần — cuốc gốc luôn là bản đăng sớm nhất trong số cuốc mới)
     * so với cuốc gốc còn hạn cùng qr_code (đã có từ trước hoặc vừa tới trong cùng lô). Khớp thì
     * trỏ duplicate_of_id về cuốc gốc và "chạm" updated_at cuốc gốc để client đang nghe since nhận
     * group_count cộng dồn mới.
     *
     * @param  list<string>  $newRideUids
     */
    private function markDuplicates(array $newRideUids, Carbon $now): void
    {
        if ($newRideUids === []) {
            return;
        }

        $newRides = FreeRide::whereIn('ride_uid', $newRideUids)->orderBy('posted_at')->orderBy('id')->get();
        $canonicals = FreeRide::whereIn('qr_code', $newRides->pluck('qr_code')->unique()->all())
            ->whereNotIn('ride_uid', $newRideUids)
            ->whereNull('duplicate_of_id')
            ->where('expires_at', '>', $now)
            ->orderBy('posted_at')->orderBy('id')
            // Đọc có khoá (trong giao dịch của ingest): hai lô chạy song song không thể cùng lấy cuốc
            // của nhau làm gốc — lô sau chờ lô trước commit rồi mới thấy trạng thái duplicate_of_id
            // mới nhất, cuốc đã thành bản trùng bị whereNull loại → không có hai hàng trỏ nhau.
            ->lockForUpdate()
            ->get()
            ->groupBy('qr_code')
            ->map(fn ($rides) => $rides->all())
            ->all();

        $touched = [];
        foreach ($newRides as $ride) {
            $canonical = collect($canonicals[$ride->qr_code] ?? [])->first(fn (FreeRide $c) => $c->sameRideAs($ride));
            if ($canonical === null) {
                // Cuốc mới không trùng (và còn hạn) thành ứng viên cuốc gốc cho cuốc mới sau nó trong lô.
                if ($ride->expires_at->gt($now)) {
                    $canonicals[$ride->qr_code][] = $ride;
                }

                continue;
            }
            $ride->update(['duplicate_of_id' => $canonical->id]);
            $touched[$canonical->id] = true;
        }

        if ($touched !== []) {
            FreeRide::whereIn('id', array_keys($touched))->update(['updated_at' => $now]);
        }
    }

    /**
     * Service gửi lại bản trùng (ví dụ group_count tăng) → group_count hiển thị của cuốc gốc đổi theo
     * (tính lúc đọc) nhưng hàng cuốc gốc không đổi; chạm updated_at để nhánh since thấy cập nhật.
     *
     * @param  list<string>  $existingRideUids
     */
    private function touchCanonicalsOf(array $existingRideUids, Carbon $now): void
    {
        if ($existingRideUids === []) {
            return;
        }

        $canonicalIds = FreeRide::whereIn('ride_uid', $existingRideUids)->whereNotNull('duplicate_of_id')
            ->pluck('duplicate_of_id')->unique()->values()->all();
        if ($canonicalIds !== []) {
            FreeRide::whereIn('id', $canonicalIds)->update(['updated_at' => $now]);
        }
    }
}
