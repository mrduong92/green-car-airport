# Cuốc Free từ nhóm Zalo — Giai đoạn 2: Tách cuốc, AI, mã QR, đồng bộ sang Laravel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến tin thô (giai đoạn 1) thành cuốc sạch: lọc rác, tách cuốc bằng quy tắc, tin khó gửi Claude Haiku theo nhóm nhỏ có trần ngân sách, lấy mã QR người bắn, rồi đồng bộ cuốc sang Laravel qua hộp thư đi; Laravel lưu `free_rides` và trả cấu hình (nhóm tắt, người bắn bị chặn, yêu cầu lấy lại mã QR, ngân sách AI) cho service.

**Architecture:** Hướng C trong spec. Trong service, mỗi tin `pending` đi qua `Processor` (đồng bộ, tức thì): nhóm tắt / người bắn bị chặn → dừng; quy tắc (`parseRides`) trả `rides` / `not_ride` / `unsure`; `unsure` vào `AiQueue` (gom ≤ 20 tin hoặc 3 giây, trần $/ngày theo giờ VN). Cuốc lưu ở bảng `rides` (hộp thư đi, gộp theo `fingerprint`); `RideSync` gửi lô ≤ 100 cuốc / 2 giây sang `POST /api/internal/zalo/rides` (upsert theo `ride_uid`). `QrQueue` lấy mã QR người bắn mới (giãn nhịp 2 giây). `ConfigPoller` hỏi `GET /api/internal/zalo/config` mỗi 60 giây; `GroupsSync` gửi danh sách nhóm mỗi 10 phút. Laravel chỉ lưu và trả cấu hình — không gọi vào service.

**Tech Stack:** Node 22 + TypeScript, `better-sqlite3`, `zca-js` 2.2.0, `@anthropic-ai/sdk` (Claude Haiku 4.5, structured outputs qua `messages.parse` + `zodOutputFormat`), `zod`, `jimp` + `jsqr`; Laravel 13 / PHP 8.4+.

**Spec:** `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md` — mục 2, 4.2, 4.3, 4.5 và sơ đồ 6.2, 6.3. **Phụ thuộc:** giai đoạn 1 (PR #10) đã merge.

## Global Constraints

- Mọi kết nối do service khởi tạo; ký HMAC như giai đoạn 1 (`X-Zalo-Timestamp`, `X-Zalo-Signature` = hex `HMAC-SHA256(secret, "{ts}.{raw body}")`; GET ký body rỗng).
- Service **chỉ đọc** với Zalo: chỉ thêm `getQR`; không gửi tin, không kết bạn.
- Quyết định 1.2: một cuốc = một tin; tin có nhiều cuốc thì tách thành nhiều cuốc; không ghép nhiều tin.
- AI: model `claude-haiku-4-5`; gom ≤ 20 tin hoặc 3 giây; trần ngân sách theo ngày giờ VN (UTC+7), mặc định `$5`, Laravel trả giá trị hiện hành qua `/config`; chạm trần → cuốc nguyên văn (`is_raw`). Giá Haiku 4.5: $1 / 1 triệu token vào, $5 / 1 triệu token ra.
- Đồng bộ: lô ≤ 100 cuốc hoặc mỗi 2 giây; chỉ đánh dấu đã đồng bộ khi Laravel trả 200; gửi lại không nhân đôi (upsert theo `ride_uid`).
- Hết hạn cuốc: `pickup_at + 30 phút`; không có giờ → `posted_at + 3 giờ`.
- Mã QR: chỉ lưu đoạn mã (`qr/p/<mã>`); làm mới khi cũ hơn 7 ngày; trạng thái `empty` không thử lại trong 7 ngày, `error` thử lại sau 1 giờ; gọi `getQR` cách nhau ≥ 2 giây.
- Giờ Việt Nam cố định UTC+7 (không có giờ mùa hè).
- `zca-js` ghim `2.2.0`; Node ≥ 22; TypeScript `strict`. Comment, log, thông báo tiếng Việt; controller Laravel trả mảng thuần.

## Quyết định mặc định (GreenCA có thể đổi)

| Câu hỏi | Mặc định trong kế hoạch | Đổi ở đâu |
| --- | --- | --- |
| Ngân sách AI | `$5/ngày` (~3,9 triệu/tháng) | `ZALO_AI_DAILY_BUDGET_USD` (Laravel) |
| Cuốc không ghi giờ hết hạn sau | 3 giờ kể từ lúc đăng | `RIDE_EXPIRE_WITHOUT_TIME_MS` (service) |
| Danh mục khu vực | Chưa làm — giai đoạn 3 lọc theo chiều / loại xe / khung giờ + tìm kiếm | — |

## Điều chỉnh sau bộ khung thông luồng (04/10) — ĐỌC TRƯỚC, ghi đè các bước bên dưới

Nhánh `feat/zalo-service-skeleton` (xếp trên giai đoạn 1, chưa merge) đã làm sẵn một phần kế hoạch này. Giai đoạn 2 làm trên nhánh `feat/zalo-service-phase2` tách từ nhánh bộ khung.

- **A1 — Schema (Task 3):** `src/db.ts` đã có `MIGRATIONS = [SCHEMA_V1, SCHEMA_V2]`, trong đó **v2 = 3 cột QR của `senders`** (đã chạy trên máy người dùng, không được sửa v2). Phần còn lại của "v2" trong kế hoạch (index `messages_status`, bảng `rides`, `ai_usage`) thành **`SCHEMA_V3`**; mọi chỗ kỳ vọng `user_version = 2` đổi thành **3**. Test DB: cập nhật `test/db-v2.test.ts` (đổi tên thành `test/db.test.ts`) theo các test của Task 3, bản DB giai đoạn 1 nâng lên 3 không mất dữ liệu.
- **A2 — Config (Task 3):** `qrIntervalMs`, `qrRefreshDays`, `allowedGroupIds` đã có trong `src/config.ts`; chỉ thêm các tham số còn lại.
- **A3 — SenderStore (Task 5):** `src/senders.ts` + `test/senders.test.ts` đã có, đúng interface kế hoạch → Task 5 chỉ làm `rides.ts`.
- **A4 — QR (Task 7):** `src/qr.ts` đã có `extractQrCode`, `decodeQrFromUrl`, `QrQueue` (`ensure`, `step`, `size`); `ApiLike.getQR`, jimp, jsqr, fake `getQR` trong test đều đã có. Task 7 chỉ còn: thêm `onUpdated(uid)` (gọi sau khi lưu mã `ok`) và `force(uid)` (bỏ qua hạn), thêm các test tương ứng vào `test/qr.test.ts` hiện có — giữ các test cũ.
- **A5 — Quyết định GreenCA: người bắn tắt "Mã QR của tôi" → bỏ qua cuốc.** Cuốc chỉ được gửi sang Laravel khi người bắn có `qr_status = 'ok'` và `qr_code` khác null:
  - `RideStore.unsynced()` và `backlog()` chỉ tính cuốc có `s.qr_status = 'ok' AND s.qr_code IS NOT NULL` (JOIN, không LEFT JOIN). Cuốc của người bắn chưa lấy mã nằm chờ trong hộp thư đi; lấy mã xong → `onUpdated` → `markSenderChanged` → được gửi. Người bắn `empty` → cuốc không bao giờ gửi, tự xoá khi `prune`. Thêm test `rides of a sender without a QR code are held back` vào `test/rides.test.ts`.
  - Payload luôn có `qr_code: string`. Laravel (Task 1) đổi `qr_code` thành `required|string|max:32|regex:/^[A-Za-z0-9]+$/`, cột `qr_code` NOT NULL; thêm test cuốc thiếu `qr_code` bị loại (`rejected`).
  - Giai đoạn 3: bỏ trạng thái "Chưa liên hệ được" — cuốc trên tab Free luôn có `contact_url`.
- **A6 — Lấy mã chỉ cho người bắn cuốc:** bộ khung đang gọi `qr.ensure` cho MỌI người gửi (`createIngestor({ onSender })` trong `src/index.ts`). Ở Task 8, `Processor` gọi `qr.ensure` khi tạo cuốc như kế hoạch, và **bỏ `onSender` khỏi `index.ts`** (giữ option trong `ingest.ts`): ít lời gọi `getQR` hơn → giảm rủi ro khoá nick phụ. Giữ `allowedGroupIds` (lọc nhóm ở ingest) song song với `disabled_group_ids` từ Laravel.
- **A7 — Không làm mất phần đã có:** `src/accounts.ts` có cơ chế mở lại listener sau 3 giây khi Zalo đóng mã 1000 (`test/accounts-reconnect.test.ts`); `src/latest.ts`, `src/cli/latest.ts`, `scripts/list-groups.ts` giữ nguyên. Sửa các file này thì giữ hành vi cũ và test cũ.

## Review Focus

1. **Tin có nhiều cuốc** (một tin 2 cuốc khác giờ) → tách đúng 2 cuốc, không gộp. Test: `splits a two-ride message into two rides` (Task 4), `multi-ride message creates two rides` (Task 5).
2. **AI trả thiếu id / trả rác / API lỗi** → tin không bị mất: id thiếu coi là không phải cuốc, lỗi API thì thử lại tối đa 3 lần rồi đánh dấu `failed`. Test: `missing ids in the AI answer are treated as not rides`, `failed batches are retried then given up` (Task 6).
3. **Service khởi động lại giữa chừng** → tin đang chờ AI (`ai_pending`) và tin `pending` chưa xử lý được xếp lại. Test: `recover re-queues ai_pending and unprocessed pending messages` (Task 8).
4. **Laravel sập rồi sống lại** → cuốc dồn trong hộp thư đi được gửi bù từng lô, cuốc đổi sau khi đã gửi được gửi lại. Test: `keeps rides when Laravel fails and resends them later`, `a ride updated after sync is sent again` (Task 8).
5. **Giờ đã qua trong ngày** ("tiễn 5h" đăng lúc 22h) → hiểu là 5h sáng hôm sau, không phải sáng nay. Test: `a time already passed today means tomorrow` (Task 4).

## File Structure

**Laravel (`backend/`)**

| File | Trách nhiệm |
| --- | --- |
| `database/migrations/2026_10_06_000001_create_zalo_rides_tables.php` | `free_rides`, `zalo_groups`, `zalo_sender_blocks`, `zalo_qr_refresh_requests` |
| `app/Models/FreeRide.php`, `ZaloGroup.php`, `ZaloSenderBlock.php`, `ZaloQrRefreshRequest.php` | Model |
| `app/Services/Zalo/ZaloRideIngestService.php` | Kiểm từng cuốc, upsert theo `ride_uid` |
| `app/Http/Controllers/Webhooks/ZaloServiceController.php` | Thêm `rides`, `groups`, `config` |
| `app/Console/Commands/PruneFreeRides.php` | `zalo:prune-rides` |
| `app/Services/Zalo/ZaloServiceMonitor.php`, `config/zalo.php`, `routes/api.php`, `routes/console.php` | Mở rộng |

**Service (`zalo-service/`)**

| File | Trách nhiệm |
| --- | --- |
| `src/db.ts` | Đánh phiên bản schema (`user_version`), migration v2 |
| `src/store.ts` | Thêm `findId`, `get`, `setStatus`, `idsByStatus` |
| `src/http.ts` | Thêm `createGetter` (GET có ký) |
| `src/config.ts` | Tham số giai đoạn 2 |
| `src/parser/time.ts` | Nhận diện giờ/ngày, quy ra thời điểm theo giờ VN |
| `src/parser/rules.ts` | Tách cuốc bằng quy tắc |
| `src/rides.ts` | Bảng `rides`: tạo/gộp theo fingerprint, hộp thư đi |
| `src/senders.ts` | Đọc/ghi mã QR người bắn |
| `src/ai/usage.ts`, `src/ai/extractor.ts`, `src/ai/queue.ts` | Chi phí AI theo ngày, gọi Claude, hàng chờ AI |
| `src/qr.ts` | Lấy & giải mã QR, hàng đợi giãn nhịp |
| `src/remote-config.ts` | Hỏi cấu hình Laravel |
| `src/processor.ts` | Điều phối xử lý một tin |
| `src/sync.ts` | `RideSync` (hộp thư đi), `GroupsSync` |
| `src/ingest.ts`, `src/accounts.ts`, `src/heartbeat.ts`, `src/index.ts` | Nối giai đoạn 2 vào |

---

### Task 1: Laravel — bảng cuốc + endpoint nhận cuốc

**Files:**
- Create: `backend/database/migrations/2026_10_06_000001_create_zalo_rides_tables.php`
- Create: `backend/app/Models/FreeRide.php`, `backend/app/Models/ZaloGroup.php`, `backend/app/Models/ZaloSenderBlock.php`, `backend/app/Models/ZaloQrRefreshRequest.php`
- Create: `backend/app/Services/Zalo/ZaloRideIngestService.php`
- Modify: `backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` (thêm method `rides`)
- Modify: `backend/routes/api.php` (thêm route trong nhóm `internal/zalo`)
- Modify: `backend/config/zalo.php` (thêm `max_rides_batch`)
- Test: `backend/tests/Feature/ZaloRideIngestTest.php`

**Interfaces:**
- Consumes: middleware `zalo.bot`, trait `SignsZaloBotRequests` (giai đoạn 1).
- Produces: `POST /api/internal/zalo/rides` nhận `{"rides": [RidePayload]}` với `RidePayload = { ride_uid, sender_uid, sender_name, qr_code|null, zalo_group_id, group_name, direction ("to_airport"|"from_airport"|"other"|null), pickup|null, destination|null, pickup_at (ms)|null, pickup_time_text|null, seats|null, vehicle_note|null, price|null, is_free (bool), is_raw (bool), raw_text, group_count (int ≥1), posted_at (ms), expires_at (ms) }`; trả `{"stored": int, "rejected": int[]}`. Task 8 gửi đúng payload này.
- Produces: models `FreeRide`, `ZaloGroup`, `ZaloSenderBlock`, `ZaloQrRefreshRequest` (Task 2 và giai đoạn 3 dùng).

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/ZaloRideIngestTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloRideIngestTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-06 03:00:00'));
    }

    private function ride(array $overrides = []): array
    {
        return array_merge([
            'ride_uid' => 'r-1', 'sender_uid' => '111', 'sender_name' => 'Hoàng Anh Đức', 'qr_code' => '758z6tl22yft',
            'zalo_group_id' => 'g1', 'group_name' => 'Taxi Nội Bài', 'direction' => 'to_airport',
            'pickup' => 'phố cổ', 'destination' => 'Sân bay Nội Bài',
            'pickup_at' => now()->addHour()->getTimestampMs(), 'pickup_time_text' => '4h15',
            'seats' => 5, 'vehicle_note' => null, 'price' => 200000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => 'tiễn 4h15 phố cổ 200k', 'group_count' => 1,
            'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHours(2)->getTimestampMs(),
        ], $overrides);
    }

    private function send(array $rides)
    {
        return $this->zaloPost('/api/internal/zalo/rides', ['rides' => $rides]);
    }

    public function test_stores_rides(): void
    {
        $this->send([$this->ride(), $this->ride(['ride_uid' => 'r-2', 'direction' => null, 'is_raw' => true, 'pickup' => null])])
            ->assertOk()->assertExactJson(['stored' => 2, 'rejected' => []]);

        $ride = FreeRide::where('ride_uid', 'r-1')->first();
        $this->assertSame('phố cổ', $ride->pickup);
        $this->assertSame(200000, $ride->price);
        $this->assertSame('758z6tl22yft', $ride->qr_code);
        $this->assertTrue($ride->expires_at->eq(now()->addHours(2)));
    }

    public function test_resending_updates_instead_of_duplicating(): void
    {
        $this->send([$this->ride()])->assertOk();
        $this->send([$this->ride(['group_count' => 3, 'qr_code' => 'newcode'])])->assertOk();

        $this->assertSame(1, FreeRide::count());
        $this->assertSame(3, FreeRide::first()->group_count);
        $this->assertSame('newcode', FreeRide::first()->qr_code);
    }

    public function test_malformed_ride_is_rejected_alone(): void
    {
        $this->send([$this->ride(), ['ride_uid' => 'x'], $this->ride(['ride_uid' => 'r-3', 'direction' => 'bay'])])
            ->assertOk()->assertJson(['stored' => 1, 'rejected' => [1, 2]]);
    }

    public function test_long_text_fields_are_truncated(): void
    {
        $this->send([$this->ride(['pickup' => str_repeat('p', 400), 'sender_name' => str_repeat('s', 400), 'raw_text' => str_repeat('r', 5000)])])
            ->assertOk()->assertJson(['stored' => 1]);

        $ride = FreeRide::first();
        $this->assertSame(255, mb_strlen($ride->pickup));
        $this->assertSame(255, mb_strlen($ride->sender_name));
        $this->assertSame(4000, mb_strlen($ride->raw_text));
    }

    public function test_batch_over_limit_is_422(): void
    {
        $rides = array_map(fn ($i) => $this->ride(['ride_uid' => "r-$i"]), range(1, 101));

        $this->send($rides)->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=ZaloRideIngestTest`
Expected: FAIL — 404 (route chưa có)

- [ ] **Step 3: Implement migration, models, service, controller, route**

`backend/database/migrations/2026_10_06_000001_create_zalo_rides_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Cuốc sạch do microservice Zalo gửi sang (upsert theo ride_uid). Hết hạn thì zalo:prune-rides xoá.
        Schema::create('free_rides', function (Blueprint $table) {
            $table->id();
            $table->string('ride_uid', 64)->unique();
            $table->string('sender_uid', 32)->index();
            $table->string('sender_name')->default('');
            $table->string('qr_code', 32)->nullable();
            $table->string('zalo_group_id', 32);
            $table->string('group_name')->default('');
            $table->string('direction', 16)->nullable();
            $table->string('pickup')->nullable();
            $table->string('destination')->nullable();
            $table->timestamp('pickup_at')->nullable();
            $table->string('pickup_time_text', 32)->nullable();
            $table->unsignedTinyInteger('seats')->nullable();
            $table->string('vehicle_note', 32)->nullable();
            $table->unsignedInteger('price')->nullable();
            $table->boolean('is_free')->default(false);
            $table->boolean('is_raw')->default(false);
            $table->text('raw_text');
            $table->unsignedSmallInteger('group_count')->default(1);
            $table->timestamp('posted_at');
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->index(['expires_at', 'posted_at']);
        });

        // Danh sách nhóm do service đồng bộ; cờ enabled do admin quản lý (service không ghi đè).
        Schema::create('zalo_groups', function (Blueprint $table) {
            $table->id();
            $table->string('zalo_group_id', 32)->unique();
            $table->string('name')->default('');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_message_at')->nullable();
            $table->unsignedInteger('messages_24h')->default(0);
            $table->timestamps();
        });

        Schema::create('zalo_sender_blocks', function (Blueprint $table) {
            $table->id();
            $table->string('sender_uid', 32)->unique();
            $table->string('reason')->nullable();
            $table->foreignId('blocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Yêu cầu lấy lại mã QR (tài xế báo link lỗi); service nhận qua GET /config, delivered_at đánh dấu đã giao.
        Schema::create('zalo_qr_refresh_requests', function (Blueprint $table) {
            $table->id();
            $table->string('sender_uid', 32)->index();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zalo_qr_refresh_requests');
        Schema::dropIfExists('zalo_sender_blocks');
        Schema::dropIfExists('zalo_groups');
        Schema::dropIfExists('free_rides');
    }
};
```

`backend/app/Models/FreeRide.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FreeRide extends Model
{
    protected $guarded = [];

    protected $casts = [
        'pickup_at'   => 'datetime',
        'posted_at'   => 'datetime',
        'expires_at'  => 'datetime',
        'is_free'     => 'boolean',
        'is_raw'      => 'boolean',
        'seats'       => 'integer',
        'price'       => 'integer',
        'group_count' => 'integer',
    ];
}
```

`backend/app/Models/ZaloGroup.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloGroup extends Model
{
    protected $guarded = [];

    protected $casts = ['enabled' => 'boolean', 'last_message_at' => 'datetime', 'messages_24h' => 'integer'];
}
```

`backend/app/Models/ZaloSenderBlock.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloSenderBlock extends Model
{
    protected $guarded = [];
}
```

`backend/app/Models/ZaloQrRefreshRequest.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloQrRefreshRequest extends Model
{
    protected $guarded = [];

    protected $casts = ['delivered_at' => 'datetime'];
}
```

`backend/app/Services/Zalo/ZaloRideIngestService.php`:

```php
<?php

namespace App\Services\Zalo;

use App\Models\FreeRide;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;

/**
 * Lưu lô cuốc sạch từ microservice Zalo. Upsert theo ride_uid: service gửi lại (retry, cuốc đổi
 * group_count / qr_code) thì cập nhật, không nhân đôi. Cuốc hỏng bị loại riêng, không hỏng cả lô.
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

        foreach ($items as $i => $item) {
            $v = Validator::make(is_array($item) ? $item : [], [
                'ride_uid'         => ['required', 'string', 'max:64'],
                'sender_uid'       => ['required', 'string', 'max:32'],
                'sender_name'      => ['nullable', 'string'],
                'qr_code'          => ['nullable', 'string', 'max:32'],
                'zalo_group_id'    => ['required', 'string', 'max:32'],
                'group_name'       => ['nullable', 'string'],
                'direction'        => ['nullable', 'in:to_airport,from_airport,other'],
                'pickup'           => ['nullable', 'string'],
                'destination'      => ['nullable', 'string'],
                'pickup_at'        => ['nullable', 'integer', 'min:0'],
                'pickup_time_text' => ['nullable', 'string', 'max:32'],
                'seats'            => ['nullable', 'integer', 'min:1', 'max:60'],
                'vehicle_note'     => ['nullable', 'string', 'max:32'],
                'price'            => ['nullable', 'integer', 'min:0'],
                'is_free'          => ['required', 'boolean'],
                'is_raw'           => ['required', 'boolean'],
                'raw_text'         => ['required', 'string'],
                'group_count'      => ['required', 'integer', 'min:1'],
                'posted_at'        => ['required', 'integer', 'min:0'],
                'expires_at'       => ['required', 'integer', 'min:0'],
            ]);
            if ($v->fails()) {
                $rejected[] = $i;
                continue;
            }
            $d = $v->validated();

            $rows[] = [
                'ride_uid'         => $d['ride_uid'],
                'sender_uid'       => $d['sender_uid'],
                'sender_name'      => mb_substr((string) ($d['sender_name'] ?? ''), 0, 255),
                'qr_code'          => $d['qr_code'] ?? null,
                'zalo_group_id'    => $d['zalo_group_id'],
                'group_name'       => mb_substr((string) ($d['group_name'] ?? ''), 0, 255),
                'direction'        => $d['direction'] ?? null,
                'pickup'           => isset($d['pickup']) ? mb_substr($d['pickup'], 0, 255) : null,
                'destination'      => isset($d['destination']) ? mb_substr($d['destination'], 0, 255) : null,
                'pickup_at'        => isset($d['pickup_at']) ? Carbon::createFromTimestampMs($d['pickup_at']) : null,
                'pickup_time_text' => $d['pickup_time_text'] ?? null,
                'seats'            => $d['seats'] ?? null,
                'vehicle_note'     => $d['vehicle_note'] ?? null,
                'price'            => $d['price'] ?? null,
                'is_free'          => (bool) $d['is_free'],
                'is_raw'           => (bool) $d['is_raw'],
                'raw_text'         => mb_substr($d['raw_text'], 0, 4000),
                'group_count'      => $d['group_count'],
                'posted_at'        => Carbon::createFromTimestampMs($d['posted_at']),
                'expires_at'       => Carbon::createFromTimestampMs($d['expires_at']),
                'created_at'       => $now,
                'updated_at'       => $now,
            ];
        }

        if ($rows !== []) {
            FreeRide::upsert($rows, ['ride_uid'], self::COLUMNS);
        }

        return ['stored' => count($rows), 'rejected' => $rejected];
    }
}
```

`backend/config/zalo.php` — thêm trước dòng cuối `];`:

```php

    // Giai đoạn 2
    'max_rides_batch' => 100,
```

`backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` — thêm `use App\Services\Zalo\ZaloRideIngestService;` và method:

```php
    public function rides(Request $request, ZaloRideIngestService $service): JsonResponse
    {
        $data = $request->validate([
            'rides' => ['required', 'array', 'max:'.config('zalo.max_rides_batch')],
        ]);

        return response()->json($service->ingest($data['rides']));
    }
```

`backend/routes/api.php` — trong nhóm `Route::middleware(['zalo.bot', 'throttle:120,1'])->prefix('internal/zalo')`, thêm dưới dòng heartbeat (và đổi throttle thành `600,1` vì service gửi lô mỗi 2 giây):

```php
    Route::post('/rides', [ZaloServiceController::class, 'rides']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T app php artisan test --filter=ZaloRideIngestTest`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_10_06_000001_create_zalo_rides_tables.php backend/app/Models/FreeRide.php backend/app/Models/ZaloGroup.php backend/app/Models/ZaloSenderBlock.php backend/app/Models/ZaloQrRefreshRequest.php backend/app/Services/Zalo/ZaloRideIngestService.php backend/app/Http/Controllers/Webhooks/ZaloServiceController.php backend/routes/api.php backend/config/zalo.php backend/tests/Feature/ZaloRideIngestTest.php
git commit -m "feat(zalo): bảng free_rides + endpoint nhận lô cuốc sạch từ service (upsert theo ride_uid)"
```

---

### Task 2: Laravel — đồng bộ nhóm, trả cấu hình, dọn cuốc, giám sát hộp thư đi

**Files:**
- Modify: `backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` (thêm `groups`, `config`; mở rộng validate heartbeat)
- Modify: `backend/routes/api.php`
- Modify: `backend/config/zalo.php`
- Modify: `backend/app/Services/Zalo/ZaloServiceMonitor.php`
- Create: `backend/app/Console/Commands/PruneFreeRides.php`
- Modify: `backend/routes/console.php`
- Test: `backend/tests/Feature/ZaloServiceConfigTest.php`

**Interfaces:**
- Consumes: models Task 1.
- Produces:
  - `POST /api/internal/zalo/groups` nhận `{"groups": [{zalo_group_id, name, last_message_at (ms)|null, messages_24h}]}` → `{"stored": int}`; không đụng cờ `enabled`.
  - `GET /api/internal/zalo/config` → `{"disabled_group_ids": string[], "blocked_sender_uids": string[], "qr_refresh_uids": string[], "ai_daily_budget_usd": number}`; yêu cầu lấy lại mã QR chưa giao được đánh dấu `delivered_at` khi trả.
  - Heartbeat nhận thêm (tuỳ chọn) `outbox_backlog`, `ai_queue_size` (int), `ai_spent_today_usd`, `ai_budget_usd` (number); `zalo:service-status` báo lỗi khi `outbox_backlog > zalo.rides_backlog_alert` (1000).
  - Lệnh `zalo:prune-rides` (03:10 hằng ngày): xoá cuốc hết hạn quá 1 ngày.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/ZaloServiceConfigTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\FreeRide;
use App\Models\ZaloGroup;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloServiceConfigTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret', 'zalo.ai_daily_budget_usd' => 5.0]);
        $this->travelTo(Carbon::parse('2026-10-06 03:00:00')); // 10:00 giờ VN
    }

    private function signedGet(string $uri)
    {
        $ts = (string) now()->timestamp;
        $sig = hash_hmac('sha256', $ts.'.', 'test-secret');

        return $this->call('GET', $uri, [], [], [], [
            'HTTP_ACCEPT' => 'application/json', 'HTTP_X_ZALO_TIMESTAMP' => $ts, 'HTTP_X_ZALO_SIGNATURE' => $sig,
        ]);
    }

    public function test_groups_sync_upserts_names_without_touching_enabled(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Cũ', 'enabled' => false]);

        $this->zaloPost('/api/internal/zalo/groups', ['groups' => [
            ['zalo_group_id' => 'g1', 'name' => 'Taxi Nội Bài', 'last_message_at' => now()->getTimestampMs(), 'messages_24h' => 420],
            ['zalo_group_id' => 'g2', 'name' => 'Xe ghép HN', 'last_message_at' => null, 'messages_24h' => 0],
        ]])->assertOk()->assertJson(['stored' => 2]);

        $g1 = ZaloGroup::where('zalo_group_id', 'g1')->first();
        $this->assertSame('Taxi Nội Bài', $g1->name);
        $this->assertFalse($g1->enabled);
        $this->assertSame(420, $g1->messages_24h);
        $this->assertTrue(ZaloGroup::where('zalo_group_id', 'g2')->first()->enabled);
    }

    public function test_config_returns_disabled_groups_blocks_budget_and_delivers_qr_requests_once(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'enabled' => false]);
        ZaloGroup::create(['zalo_group_id' => 'g2', 'enabled' => true]);
        ZaloSenderBlock::create(['sender_uid' => 'spam1']);
        ZaloQrRefreshRequest::create(['sender_uid' => '111']);
        ZaloQrRefreshRequest::create(['sender_uid' => '111']);

        $this->signedGet('/api/internal/zalo/config')->assertOk()->assertExactJson([
            'disabled_group_ids'  => ['g1'],
            'blocked_sender_uids' => ['spam1'],
            'qr_refresh_uids'     => ['111'],
            'ai_daily_budget_usd' => 5.0, // PHP encode float 5.0 thành "5.0"
        ]);

        $this->signedGet('/api/internal/zalo/config')->assertOk()->assertJson(['qr_refresh_uids' => []]);
    }

    public function test_config_requires_signature(): void
    {
        $this->getJson('/api/internal/zalo/config')->assertStatus(401);
    }

    public function test_prune_rides_deletes_rides_expired_over_a_day(): void
    {
        $base = ['sender_uid' => '1', 'zalo_group_id' => 'g', 'raw_text' => 'x', 'posted_at' => now()];
        FreeRide::create($base + ['ride_uid' => 'old', 'expires_at' => now()->subDays(2)]);
        FreeRide::create($base + ['ride_uid' => 'recent', 'expires_at' => now()->subHours(2)]);

        $this->artisan('zalo:prune-rides')->expectsOutputToContain('Đã xoá 1 cuốc')->assertSuccessful();
        $this->assertSame(['recent'], FreeRide::pluck('ride_uid')->all());
    }

    public function test_status_alerts_when_outbox_backlog_is_large(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', [
            'service_id' => 'zalo-1', 'uptime_s' => 60, 'accounts' => [['id' => 'acc1', 'connected' => true]],
            'received_total' => 1, 'stored_total' => 1, 'duplicates_total' => 0, 'skipped_non_text' => 0,
            'last_message_at' => now()->getTimestampMs(),
            'outbox_backlog' => 1500, 'ai_queue_size' => 3, 'ai_spent_today_usd' => 1.25, 'ai_budget_usd' => 5,
        ])->assertOk();

        $this->artisan('zalo:service-status')->expectsOutputToContain('hộp thư đi tồn 1500 cuốc')->assertExitCode(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=ZaloServiceConfigTest`
Expected: FAIL — 404 cho `/groups` và `/config`, `Command "zalo:prune-rides" is not defined`

- [ ] **Step 3: Implement**

`backend/config/zalo.php` — trong khối `// Giai đoạn 2` thêm:

```php
    'ai_daily_budget_usd' => (float) env('ZALO_AI_DAILY_BUDGET_USD', 5),
    'rides_backlog_alert' => 1000,
```

`backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` — thêm `use App\Models\ZaloGroup;`, `use App\Models\ZaloQrRefreshRequest;`, `use App\Models\ZaloSenderBlock;`, `use Illuminate\Support\Carbon;`, thêm vào mảng validate của `heartbeat`:

```php
            'outbox_backlog'       => ['sometimes', 'integer', 'min:0'],
            'ai_queue_size'        => ['sometimes', 'integer', 'min:0'],
            'ai_spent_today_usd'   => ['sometimes', 'numeric', 'min:0'],
            'ai_budget_usd'        => ['sometimes', 'numeric', 'min:0'],
```

và hai method:

```php
    public function groups(Request $request): JsonResponse
    {
        $data = $request->validate([
            'groups'                   => ['required', 'array', 'max:2000'],
            'groups.*.zalo_group_id'   => ['required', 'string', 'max:32'],
            'groups.*.name'            => ['nullable', 'string'],
            'groups.*.last_message_at' => ['nullable', 'integer', 'min:0'],
            'groups.*.messages_24h'    => ['required', 'integer', 'min:0'],
        ]);

        $now = now();
        $rows = array_map(fn (array $g) => [
            'zalo_group_id'   => $g['zalo_group_id'],
            'name'            => mb_substr((string) ($g['name'] ?? ''), 0, 255),
            'last_message_at' => isset($g['last_message_at']) ? Carbon::createFromTimestampMs($g['last_message_at']) : null,
            'messages_24h'    => $g['messages_24h'],
            'created_at'      => $now,
            'updated_at'      => $now,
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
            'disabled_group_ids'  => ZaloGroup::where('enabled', false)->pluck('zalo_group_id')->values()->all(),
            'blocked_sender_uids' => ZaloSenderBlock::pluck('sender_uid')->values()->all(),
            'qr_refresh_uids'     => $requests->pluck('sender_uid')->unique()->values()->all(),
            'ai_daily_budget_usd' => (float) config('zalo.ai_daily_budget_usd'),
        ]);
    }
```

`backend/routes/api.php` — trong nhóm `internal/zalo`:

```php
    Route::post('/groups', [ZaloServiceController::class, 'groups']);
    Route::get('/config', [ZaloServiceController::class, 'config']);
```

`backend/app/Services/Zalo/ZaloServiceMonitor.php` — trong vòng lặp service, ngay sau khối `if ($hb['accounts'] === []) ... else ...` thêm:

```php
            $backlog = (int) ($hb['outbox_backlog'] ?? 0);
            if ($backlog > (int) config('zalo.rides_backlog_alert')) {
                $status = 1;
                $lines[] = "{$id}: hộp thư đi tồn {$backlog} cuốc (Laravel không nhận được cuốc?)";
            }
```

`backend/app/Console/Commands/PruneFreeRides.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\FreeRide;
use Illuminate\Console\Command;

// Cuốc Free chỉ hiển thị khi còn hạn; giữ thêm 1 ngày cho báo cáo/tra cứu rồi xoá.
class PruneFreeRides extends Command
{
    protected $signature = 'zalo:prune-rides';

    protected $description = 'Xoá cuốc Free hết hạn quá 1 ngày';

    public function handle(): int
    {
        $total = 0;
        do {
            $deleted = FreeRide::where('expires_at', '<', now()->subDay())->limit(5000)->delete();
            $total += $deleted;
        } while ($deleted > 0);

        $this->info("Đã xoá {$total} cuốc Free hết hạn");

        return self::SUCCESS;
    }
}
```

`backend/routes/console.php` — thêm cuối file:

```php
// Cuốc Free (microservice Zalo): xoá cuốc hết hạn quá 1 ngày.
Schedule::command('zalo:prune-rides')->dailyAt('03:10');
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec -T app php artisan test --filter=Zalo`
Expected: PASS (mọi test Zalo, gồm 5 test mới)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Webhooks/ZaloServiceController.php backend/routes/api.php backend/config/zalo.php backend/app/Services/Zalo/ZaloServiceMonitor.php backend/app/Console/Commands/PruneFreeRides.php backend/routes/console.php backend/tests/Feature/ZaloServiceConfigTest.php
git commit -m "feat(zalo): đồng bộ nhóm, endpoint cấu hình cho service, dọn cuốc hết hạn, cảnh báo hộp thư đi tồn"
```

---

### Task 3: Service — schema v2, GET có ký, tham số giai đoạn 2, truy vấn tin

**Files:**
- Modify: `zalo-service/src/db.ts`
- Modify: `zalo-service/src/store.ts`
- Modify: `zalo-service/src/http.ts`
- Modify: `zalo-service/src/config.ts`
- Test: `zalo-service/test/db.test.ts`, `zalo-service/test/http-get.test.ts`, `zalo-service/test/store-query.test.ts`, `zalo-service/test/config-phase2.test.ts`

**Interfaces:**
- Produces:
  - `openDb(path)` chạy migration theo `PRAGMA user_version` (v1 = schema giai đoạn 1, v2 = cột QR ở `senders`, bảng `rides`, `ai_usage`, index `messages_status`). DB giai đoạn 1 nâng cấp không mất dữ liệu.
  - `MessageStore`: `findId(groupId, msgId): number | undefined`, `get(id): StoredMessage | undefined` (`{ id, zalo_group_id, sender_uid, content, sent_at, parse_status }`), `setStatus(id, status: MessageStatus): void`, `idsByStatus(status: MessageStatus, sinceSentAt: number): number[]`. `MessageStatus = 'pending'|'duplicate'|'not_ride'|'ride'|'raw'|'ai_pending'|'blocked'|'skipped_group'|'failed'`.
  - `createGetter({ baseUrl, secret, fetchImpl?, timeoutMs? }): (path) => Promise<{ status: number; body?: unknown; error?: string }>`.
  - `Config` thêm: `aiModel` ('claude-haiku-4-5'), `aiEnabled` (có `ANTHROPIC_API_KEY`), `aiBatchSize` (20), `aiFlushMs` (3000), `aiDailyBudgetUsd` (5), `ridesBatchSize` (100), `ridesFlushMs` (2000), `configPollMs` (60000), `groupsSyncMs` (600000), `qrIntervalMs` (2000), `qrRefreshDays` (7), `rideExpireAfterPickupMs` (1800000), `rideExpireWithoutTimeMs` (10800000).

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/db.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDb } from '../src/db.js'

test('fresh database is at the latest schema version', () => {
  const db = openDb(':memory:')
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  const cols = (db.prepare('PRAGMA table_info(senders)').all() as { name: string }[]).map((c) => c.name)
  assert.ok(cols.includes('qr_code') && cols.includes('qr_fetched_at') && cols.includes('qr_status'))
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'rides'").get())
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_usage'").get())
})

test('a phase-1 database is upgraded in place without losing messages', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'zalo-')), 'zalo.sqlite')
  const old = new Database(path)
  old.exec(`CREATE TABLE senders (uid TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', last_seen_at INTEGER);
            CREATE TABLE messages (id INTEGER PRIMARY KEY, zalo_group_id TEXT NOT NULL, zalo_msg_id TEXT NOT NULL, sender_uid TEXT NOT NULL,
              account_id TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, sent_at INTEGER NOT NULL,
              received_at INTEGER NOT NULL, parse_status TEXT NOT NULL DEFAULT 'pending', UNIQUE (zalo_group_id, zalo_msg_id));
            INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức');
            INSERT INTO messages (zalo_group_id, zalo_msg_id, sender_uid, account_id, content, content_hash, sent_at, received_at)
              VALUES ('g1', 'm1', '111', 'acc1', 'tiễn 5h', 'h', 1, 1);`)
  old.close()

  const db = openDb(path)
  assert.equal(db.pragma('user_version', { simple: true }), 2)
  assert.deepEqual(db.prepare('SELECT content FROM messages').get(), { content: 'tiễn 5h' })
  assert.deepEqual(db.prepare('SELECT display_name, qr_code FROM senders').get(), { display_name: 'Đức', qr_code: null })
})
```

`zalo-service/test/http-get.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGetter } from '../src/http.js'
import { sign } from '../src/sign.js'

test('signs an empty body and returns parsed JSON', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured = { url, init }
    return { status: 200, json: async () => ({ ok: 1 }) } as unknown as Response
  }) as unknown as typeof fetch
  const get = createGetter({ baseUrl: 'https://greenca.vn', secret: 's', fetchImpl })

  const res = await get('/api/internal/zalo/config')

  assert.deepEqual(res, { status: 200, body: { ok: 1 } })
  assert.equal(captured?.init.method, 'GET')
  const headers = captured!.init.headers as Record<string, string>
  assert.equal(headers['X-Zalo-Signature'], sign('s', '', Number(headers['X-Zalo-Timestamp']) * 1000).signature)
})

test('returns status 0 on network error', async () => {
  const get = createGetter({ baseUrl: 'https://x', secret: 's', fetchImpl: (async () => { throw new Error('ETIMEDOUT') }) as unknown as typeof fetch })
  assert.equal((await get('/p')).status, 0)
})
```

`zalo-service/test/store-query.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'

const HOUR = 3_600_000

test('find, get, setStatus and idsByStatus', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const base = { group_id: 'g1', group_name: '', sender_uid: '111', sender_name: '', sent_at: 1000 }
  store.save({ ...base, msg_id: 'a', content: 'tiễn 5h Hà Đông' }, 'acc1')
  store.save({ ...base, msg_id: 'b', content: 'chào cả nhà', sent_at: 5000 }, 'acc1')

  const id = store.findId('g1', 'a')!
  assert.deepEqual(store.get(id), { id, zalo_group_id: 'g1', sender_uid: '111', content: 'tiễn 5h Hà Đông', sent_at: 1000, parse_status: 'pending' })
  assert.equal(store.findId('g1', 'zzz'), undefined)

  store.setStatus(id, 'ai_pending')
  assert.deepEqual(store.idsByStatus('ai_pending', 0), [id])
  assert.deepEqual(store.idsByStatus('pending', 2000), [store.findId('g1', 'b')])
})
```

`zalo-service/test/config-phase2.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('phase 2 defaults', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's' })
  assert.equal(cfg.aiModel, 'claude-haiku-4-5')
  assert.equal(cfg.aiEnabled, false)
  assert.equal(cfg.aiBatchSize, 20)
  assert.equal(cfg.aiFlushMs, 3000)
  assert.equal(cfg.aiDailyBudgetUsd, 5)
  assert.equal(cfg.ridesBatchSize, 100)
  assert.equal(cfg.ridesFlushMs, 2000)
  assert.equal(cfg.configPollMs, 60_000)
  assert.equal(cfg.groupsSyncMs, 600_000)
  assert.equal(cfg.qrIntervalMs, 2000)
  assert.equal(cfg.qrRefreshDays, 7)
  assert.equal(cfg.rideExpireAfterPickupMs, 1_800_000)
  assert.equal(cfg.rideExpireWithoutTimeMs, 10_800_000)
})

test('AI is enabled when an Anthropic key is present', () => {
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', ANTHROPIC_API_KEY: 'sk-x' }).aiEnabled, true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `user_version` = 0, `createGetter` / `findId` không tồn tại, `cfg.aiModel` undefined

- [ ] **Step 3: Implement**

`zalo-service/src/db.ts` — thay toàn bộ file:

```ts
import Database from 'better-sqlite3'

export type Db = Database.Database

// Bảng nhóm đặt tên chat_groups vì GROUPS là từ khoá của SQLite (window function).
// v1 dùng IF NOT EXISTS để DB giai đoạn 1 (user_version = 0, bảng đã có) chạy lại an toàn.
const MIGRATIONS: string[] = [
  `
CREATE TABLE IF NOT EXISTS chat_groups (
  zalo_group_id   TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER
);
CREATE TABLE IF NOT EXISTS senders (
  uid          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY,
  zalo_group_id TEXT NOT NULL,
  zalo_msg_id   TEXT NOT NULL,
  sender_uid    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  sent_at       INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  parse_status  TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (zalo_group_id, zalo_msg_id)
);
CREATE INDEX IF NOT EXISTS messages_hash_sent ON messages (content_hash, sent_at);
CREATE INDEX IF NOT EXISTS messages_sent ON messages (sent_at);
`,
  `
ALTER TABLE senders ADD COLUMN qr_code TEXT;
ALTER TABLE senders ADD COLUMN qr_fetched_at INTEGER;
ALTER TABLE senders ADD COLUMN qr_status TEXT;
CREATE INDEX messages_status ON messages (parse_status, sent_at);
CREATE TABLE rides (
  id               INTEGER PRIMARY KEY,
  ride_uid         TEXT NOT NULL UNIQUE,
  message_id       INTEGER NOT NULL,
  sender_uid       TEXT NOT NULL,
  zalo_group_id    TEXT NOT NULL,
  direction        TEXT,
  pickup           TEXT,
  destination      TEXT,
  pickup_at        INTEGER,
  pickup_time_text TEXT,
  seats            INTEGER,
  vehicle_note     TEXT,
  price            INTEGER,
  is_free          INTEGER NOT NULL DEFAULT 0,
  is_raw           INTEGER NOT NULL DEFAULT 0,
  raw_text         TEXT NOT NULL,
  fingerprint      TEXT NOT NULL,
  group_count      INTEGER NOT NULL DEFAULT 1,
  posted_at        INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  synced_at        INTEGER
);
CREATE INDEX rides_fingerprint ON rides (fingerprint, expires_at);
CREATE INDEX rides_sync ON rides (synced_at, updated_at);
CREATE INDEX rides_sender ON rides (sender_uid, expires_at);
CREATE TABLE ai_usage (
  day           TEXT PRIMARY KEY,
  calls         INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0
);
`,
]

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version])
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
  return db
}
```

`zalo-service/src/store.ts` — thêm kiểu và các method (giữ nguyên phần cũ):

Thêm ngay dưới `export type SaveResult = ...`:

```ts
export type MessageStatus =
  | 'pending' | 'duplicate' | 'not_ride' | 'ride' | 'raw' | 'ai_pending' | 'blocked' | 'skipped_group' | 'failed'

export interface StoredMessage {
  id: number
  zalo_group_id: string
  sender_uid: string
  content: string
  sent_at: number
  parse_status: MessageStatus
}
```

Thêm field khai báo cạnh các statement khác:

```ts
  private readonly findStmt: Database.Statement
  private readonly getStmt: Database.Statement
  private readonly statusStmt: Database.Statement
  private readonly byStatusStmt: Database.Statement
```

Trong constructor, sau dòng `this.renameGroup = ...`:

```ts
    this.findStmt = db.prepare('SELECT id FROM messages WHERE zalo_group_id = ? AND zalo_msg_id = ?')
    this.getStmt = db.prepare('SELECT id, zalo_group_id, sender_uid, content, sent_at, parse_status FROM messages WHERE id = ?')
    this.statusStmt = db.prepare('UPDATE messages SET parse_status = ? WHERE id = ?')
    this.byStatusStmt = db.prepare('SELECT id FROM messages WHERE parse_status = ? AND sent_at >= ? ORDER BY id')
```

Thêm method (trước `prune`):

```ts
  findId(groupId: string, msgId: string): number | undefined {
    return (this.findStmt.get(groupId, msgId) as { id: number } | undefined)?.id
  }

  get(id: number): StoredMessage | undefined {
    return this.getStmt.get(id) as StoredMessage | undefined
  }

  setStatus(id: number, status: MessageStatus): void {
    this.statusStmt.run(status, id)
  }

  idsByStatus(status: MessageStatus, sinceSentAt: number): number[] {
    return (this.byStatusStmt.all(status, sinceSentAt) as { id: number }[]).map((r) => r.id)
  }
```

`zalo-service/src/http.ts` — thêm cuối file:

```ts
export type Getter = (path: string) => Promise<{ status: number; body?: unknown; error?: string }>

// GET có ký (body rỗng) — dùng hỏi cấu hình Laravel. Không ném lỗi; status = 0 là lỗi mạng.
export function createGetter(opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Getter {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000

  return async (path) => {
    const { timestamp, signature } = sign(opts.secret, '')
    try {
      const res = await fetchImpl(opts.baseUrl + path, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Zalo-Timestamp': timestamp, 'X-Zalo-Signature': signature },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status !== 200) return { status: res.status }
      return { status: 200, body: await res.json() }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
```

`zalo-service/src/config.ts` — thêm vào `interface Config`:

```ts
  aiModel: string
  aiEnabled: boolean
  aiBatchSize: number
  aiFlushMs: number
  aiDailyBudgetUsd: number
  ridesBatchSize: number
  ridesFlushMs: number
  configPollMs: number
  groupsSyncMs: number
  qrIntervalMs: number
  qrRefreshDays: number
  rideExpireAfterPickupMs: number
  rideExpireWithoutTimeMs: number
```

và vào object trả về của `loadConfig` (sau `maxContentLength`):

```ts
    aiModel: env.AI_MODEL || 'claude-haiku-4-5',
    aiEnabled: Boolean(env.ANTHROPIC_API_KEY),
    aiBatchSize: Number(env.AI_BATCH_SIZE || 20),
    aiFlushMs: Number(env.AI_FLUSH_MS || 3000),
    aiDailyBudgetUsd: Number(env.AI_DAILY_BUDGET_USD || 5),
    ridesBatchSize: Number(env.RIDES_BATCH_SIZE || 100),
    ridesFlushMs: Number(env.RIDES_FLUSH_MS || 2000),
    configPollMs: Number(env.CONFIG_POLL_MS || 60_000),
    groupsSyncMs: Number(env.GROUPS_SYNC_MS || 600_000),
    qrIntervalMs: Number(env.QR_INTERVAL_MS || 2000),
    qrRefreshDays: Number(env.QR_REFRESH_DAYS || 7),
    rideExpireAfterPickupMs: Number(env.RIDE_EXPIRE_AFTER_PICKUP_MS || 30 * 60_000),
    rideExpireWithoutTimeMs: Number(env.RIDE_EXPIRE_WITHOUT_TIME_MS || 3 * 3_600_000),
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck sạch

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/db.ts zalo-service/src/store.ts zalo-service/src/http.ts zalo-service/src/config.ts zalo-service/test/db.test.ts zalo-service/test/http-get.test.ts zalo-service/test/store-query.test.ts zalo-service/test/config-phase2.test.ts
git commit -m "feat(zalo-service): schema v2 có đánh phiên bản, GET có ký, tham số giai đoạn 2, truy vấn tin theo trạng thái"
```

---

### Task 4: Service — bộ tách cuốc bằng quy tắc

**Files:**
- Create: `zalo-service/src/parser/time.ts`
- Create: `zalo-service/src/parser/rules.ts`
- Test: `zalo-service/test/time.test.ts`, `zalo-service/test/rules.test.ts`

**Interfaces:**
- Produces:
  - `resolvePickupAt(sentAt: number, hour: number, minute: number, day?: number | null, month?: number | null): number` — giờ VN (UTC+7); không có ngày mà giờ đã qua hơn 30 phút → hôm sau; có ngày mà đã qua hơn 1 ngày → năm sau.
  - `findTimes(text: string): TimeToken[]` với `TimeToken = { hour: number; minute: number; text: string; start: number; end: number; relative: boolean }`; `findDate(text: string): { day: number; month: number; text: string } | null`.
  - `type Direction = 'to_airport' | 'from_airport' | 'other'`; `interface RideDraft { direction: Direction | null; pickup: string | null; destination: string | null; pickupAt: number | null; pickupTimeText: string | null; seats: number | null; vehicleNote: string | null; price: number | null; isFree: boolean; rawText: string }`; `const AIRPORT = 'Sân bay Nội Bài'`.
  - `parseRides(content: string, sentAt: number): ParseOutcome` với `ParseOutcome = { kind: 'rides'; rides: RideDraft[] } | { kind: 'not_ride' } | { kind: 'unsure' }`. Quy tắc chỉ nhận mẫu chắc chắn; mọi thứ khác là `unsure` (để AI xử lý).

Mẫu tin dùng trong test lấy từ ảnh nhóm Zalo / app Lịch Xe người dùng cung cấp (chỉ nội dung, không có tên người gửi). Khi giai đoạn 1 có dữ liệu thật, bổ sung mẫu vào `rules.test.ts`.

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/time.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDate, findTimes, resolvePickupAt } from '../src/parser/time.js'

const VN = 7 * 3_600_000
const vn = (ms: number) => new Date(ms + VN).toISOString().slice(0, 16).replace('T', ' ')
const at = (s: string) => Date.parse(s.replace(' ', 'T') + ':00Z') - VN // "2026-10-04 01:30" giờ VN → ms

test('a time later today stays today', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 01:30'), 4, 15)), '2026-10-04 04:15')
})

test('a time already passed today means tomorrow', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 22:00'), 5, 0)), '2026-10-05 05:00')
})

test('a time a few minutes ago stays today (late post)', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 05:10'), 5, 0)), '2026-10-04 05:00')
})

test('an explicit date is used, with year rollover', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 01:30'), 6, 45, 4, 10)), '2026-10-04 06:45')
  assert.equal(vn(resolvePickupAt(at('2026-12-31 20:00'), 7, 0, 2, 1)), '2027-01-02 07:00')
})

test('findTimes recognises common formats and ignores overlaps', () => {
  const pick = (t: string) => findTimes(t).map((x) => [x.hour, x.minute, x.text, x.relative])
  assert.deepEqual(pick('tiễn 4h15 phố cổ'), [[4, 15, '4h15', false]])
  assert.deepEqual(pick('8h30\' tiễn'), [[8, 30, "8h30'", false]])
  assert.deepEqual(pick('4/10 _7h00_ 50 Nguyễn Chí Thanh'), [[7, 0, '7h00', false]])
  assert.deepEqual(pick('X7  15-16h Tam Cốc'), [[15, 0, '15-16h', false]])
  assert.deepEqual(pick('12:30 khánh hội'), [[12, 30, '12:30', false]])
  assert.deepEqual(pick('0-30p bx vf8'), [[0, 30, '0-30p', true]])
  assert.deepEqual(pick('ck 200 0.25 xe 5 280,000đ'), [])
})

test('findDate reads day/month only', () => {
  assert.deepEqual(findDate('4/10  Tiễn  6h45'), { day: 4, month: 10, text: '4/10' })
  assert.equal(findDate('tiễn 6h45'), null)
})
```

`zalo-service/test/rules.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIRPORT, parseRides, type RideDraft } from '../src/parser/rules.js'

const VN = 7 * 3_600_000
const vn = (ms: number | null) => (ms === null ? null : new Date(ms + VN).toISOString().slice(0, 16).replace('T', ' '))
const SENT = Date.parse('2026-10-04T01:30:00Z') - VN // 01:30 ngày 04/10 giờ VN

function pick(r: RideDraft) {
  return {
    direction: r.direction, pickup: r.pickup, destination: r.destination, at: vn(r.pickupAt),
    time: r.pickupTimeText, seats: r.seats, vehicle: r.vehicleNote, price: r.price, free: r.isFree,
  }
}

function rides(content: string) {
  const out = parseRides(content, SENT)
  assert.equal(out.kind, 'rides', `mong đợi rides, nhận ${out.kind} cho: ${content}`)
  return (out as { kind: 'rides'; rides: RideDraft[] }).rides.map(pick)
}

test('tiễn with commission tokens', () => {
  assert.deepEqual(rides('tiễn 4h15 phố cổ ck 200 0.25'), [
    { direction: 'to_airport', pickup: 'phố cổ', destination: AIRPORT, at: '2026-10-04 04:15', time: '4h15', seats: null, vehicle: null, price: null, free: false },
  ])
})

test('splits a two-ride message into two rides, inheriting free flag and direction', () => {
  assert.deepEqual(rides('Feee\n4/10  Tiễn  6h45 _  40 Tương Mai  , ko thu ck230\n\n 4/10 _7h00_  50 Nguyễn Chí Thanh , ko thu ck200'), [
    { direction: 'to_airport', pickup: '40 Tương Mai', destination: AIRPORT, at: '2026-10-04 06:45', time: '6h45', seats: null, vehicle: null, price: 230000, free: true },
    { direction: 'to_airport', pickup: '50 Nguyễn Chí Thanh', destination: AIRPORT, at: '2026-10-04 07:00', time: '7h00', seats: null, vehicle: null, price: 200000, free: true },
  ])
})

test('table-like rows with seats and formatted prices', () => {
  assert.deepEqual(rides('4h30     Tiễn      khu đất dịch vụ xã hoài đức          280,000đ       xe 5       TK 0.25\n\n4h45     Tiễn       r1 swanlake ecopark       250,000đ       xe 5       TK 0.25'), [
    { direction: 'to_airport', pickup: 'khu đất dịch vụ xã hoài đức', destination: AIRPORT, at: '2026-10-04 04:30', time: '4h30', seats: 5, vehicle: null, price: 280000, free: false },
    { direction: 'to_airport', pickup: 'r1 swanlake ecopark', destination: AIRPORT, at: '2026-10-04 04:45', time: '4h45', seats: 5, vehicle: null, price: 250000, free: false },
  ])
})

test('explicit separator, time range, vehicle note, destination cut at comma', () => {
  assert.deepEqual(rides('X7  15-16h Tam Cốc --> Hà Đông 800k, khách có 7 người'), [
    { direction: 'other', pickup: 'Tam Cốc', destination: 'Hà Đông', at: '2026-10-04 15:00', time: '15-16h', seats: null, vehicle: 'x7', price: 800000, free: false },
  ])
})

test('ignores tiny "1k" (one passenger) and uses the real price', () => {
  assert.deepEqual(rides('12h30 1k khánh hội ninh bình - nút giao khánh hoà 150k'), [
    { direction: 'other', pickup: 'khánh hội ninh bình', destination: 'nút giao khánh hoà', at: '2026-10-04 12:30', time: '12h30', seats: null, vehicle: null, price: 150000, free: false },
  ])
})

test('đón at the airport with a separator', () => {
  assert.deepEqual(rides('đón T1 9h về Hà Đông 300k'), [
    { direction: 'from_airport', pickup: `${AIRPORT} (T1)`, destination: 'Hà Đông', at: '2026-10-04 09:00', time: '9h', seats: null, vehicle: null, price: 300000, free: false },
  ])
})

test('ambiguous messages go to AI', () => {
  for (const content of [
    '5h tran nhan tong 200k free CK pl',
    "8h30' tiễn 89 Quan Nhân về Đại Tảo Đa Phúc SS 2c đổ đón tầm 12h30' hẹn khách đón về lại tk600k sdb vf6",
    '0-30p bx vf8 hoặc limo yên vỹ yên phong bn đi kcn quang minh 250k',
    'T1 - trần khát chân 180k freeeeeeee',
  ]) {
    assert.equal(parseRides(content, SENT).kind, 'unsure', content)
  }
})

test('chatter is not a ride', () => {
  for (const content of ['chào cả nhà', 'ae nào ở Hà Đông không', 'ok anh']) {
    assert.equal(parseRides(content, SENT).kind, 'not_ride', content)
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/parser/time.js'` / `rules.js`

- [ ] **Step 3: Implement time and rules**

`zalo-service/src/parser/time.ts`:

```ts
// Giờ Việt Nam cố định UTC+7 (không có giờ mùa hè).
const VN_OFFSET_MS = 7 * 3_600_000
const DAY_MS = 24 * 3_600_000

export interface TimeToken {
  hour: number
  minute: number
  text: string
  start: number
  end: number
  relative: boolean
}

// Thứ tự = độ ưu tiên khi trùng vị trí ("15-16h" thắng "16h").
const PATTERNS: { re: RegExp; relative: boolean; read: (m: RegExpExecArray) => [number, number] }[] = [
  { re: /(?<![\d/:])(\d{1,2})\s*-\s*(\d{1,3})\s*(?:phút|ph|p)(?![\p{L}\d])/giu, relative: true, read: (m) => [Number(m[1]), Number(m[2])] },
  { re: /(?<![\d/:])(\d{1,2})\s*-\s*(\d{1,2})\s*h(?![\p{L}\d])/giu, relative: false, read: (m) => [Number(m[1]), 0] },
  { re: /(?<![\d/:])(\d{1,2}):(\d{2})(?!\d)/gu, relative: false, read: (m) => [Number(m[1]), Number(m[2])] },
  { re: /(?<![\d/:\p{L}])(\d{1,2})\s*[hg]\s*(\d{2})?'?(?![\p{L}\d])/giu, relative: false, read: (m) => [Number(m[1]), m[2] ? Number(m[2]) : 0] },
]

export function findTimes(text: string): TimeToken[] {
  const found: TimeToken[] = []
  for (const { re, relative, read } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (found.some((f) => start < f.end && end > f.start)) continue
      const [hour, minute] = read(m as RegExpExecArray)
      if (!relative && (hour > 23 || minute > 59)) continue
      found.push({ hour, minute, text: m[0].trim(), start, end, relative })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

export function findDate(text: string): { day: number; month: number; text: string } | null {
  const m = /(?<![\d:/])(\d{1,2})\/(\d{1,2})(?![\d/])/u.exec(text)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month, text: m[0] }
}

export function resolvePickupAt(sentAt: number, hour: number, minute: number, day?: number | null, month?: number | null): number {
  const local = new Date(sentAt + VN_OFFSET_MS) // getUTC* trên mốc đã cộng 7h = giờ VN
  const year = local.getUTCFullYear()
  const m = month ? month - 1 : local.getUTCMonth()
  const d = day ?? local.getUTCDate()
  let candidate = Date.UTC(year, m, d, hour, minute) - VN_OFFSET_MS

  if (day == null) {
    if (candidate < sentAt - 30 * 60_000) candidate += DAY_MS // giờ đã qua → hôm sau
  } else if (candidate < sentAt - DAY_MS) {
    candidate = Date.UTC(year + 1, m, d, hour, minute) - VN_OFFSET_MS // "2/1" đăng ngày 31/12
  }
  return candidate
}
```

`zalo-service/src/parser/rules.ts`:

```ts
import { findDate, findTimes, resolvePickupAt } from './time.js'

export type Direction = 'to_airport' | 'from_airport' | 'other'

export interface RideDraft {
  direction: Direction | null
  pickup: string | null
  destination: string | null
  pickupAt: number | null
  pickupTimeText: string | null
  seats: number | null
  vehicleNote: string | null
  price: number | null
  isFree: boolean
  rawText: string
}

export type ParseOutcome = { kind: 'rides'; rides: RideDraft[] } | { kind: 'not_ride' } | { kind: 'unsure' }

export const AIRPORT = 'Sân bay Nội Bài'

// Ranh giới từ cho chữ có dấu: \b của JS chỉ hiểu ASCII.
const word = (src: string, flags = 'giu') => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, flags)
// Regex có cờ g giữ lastIndex giữa các lần .test() → luôn kiểm bằng bản không có g.
const has = (re: RegExp, text: string) => new RegExp(re.source, 'iu').test(text)

const TIEN = word('ti[eễ]n')
const DON = word('[đd][oó]n')
const AIRPORT_TOKEN = word('s[aâ]n\\s*bay(?:\\s*n[oộ]i\\s*b[aà]i)?|n[oộ]i\\s*b[aà]i|sb|nb|t[12]')
const AIRPORT_ONLY = /^(?:s[aâ]n\s*bay(?:\s*n[oộ]i\s*b[aà]i)?|n[oộ]i\s*b[aà]i|sb|nb|(t[12]))$/iu
const FREE_CK = word('(?:ko|k|không|khong)\\s+thu\\s+ck\\s*(\\d{2,4})?')
const FREE_WORD = word('f+r*e{2,}|free')
const FEE = word('(?:ck|tk)\\s*\\d[\\d.,]*k?')
const RATE = /(?<![\p{L}\d.,])0[.,]\d{1,2}(?!\d)/gu
const SEATS = [word('xe\\s*(\\d{1,2})'), word('(\\d{1,2})\\s*(?:c|chỗ|cho)')]
const VALID_SEATS = new Set([4, 5, 7, 9, 16, 29, 45])
const VEHICLE = word('limo(?:usine)?|vf\\s?\\d|x7|xl7', 'iu')
const SEPARATOR = /\s*(?:-->|->|=>|→|>|–|—)\s*|\s+-\s+|\s+(?:về|đi|tới|đến)\s+/iu

// Giá: lấy theo thứ tự, xoá phần đã đọc để không đếm hai lần. Dưới 10.000đ không phải giá ("1k" = 1 khách).
const PRICES: { re: RegExp; read: (m: RegExpMatchArray) => number }[] = [
  { re: word('(\\d{1,3}(?:[.,]\\d{3})+)\\s*(?:đ|vnđ|vnd|d)?'), read: (m) => Number(m[1].replace(/[.,]/g, '')) },
  { re: word('(\\d+)[.,](\\d)\\s*tr(?:i[eệ]u)?'), read: (m) => Number(m[1]) * 1_000_000 + Number(m[2]) * 100_000 },
  { re: word('(\\d+)\\s*tr(?:i[eệ]u)?\\s*(\\d)?'), read: (m) => Number(m[1]) * 1_000_000 + (m[2] ? Number(m[2]) * 100_000 : 0) },
  { re: word('(\\d+)\\s*k'), read: (m) => Number(m[1]) * 1000 },
]

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .split(',')
    .map((part) => part.replace(/^[\s_.\-:;()'"]+|[\s_.\-:;()'"]+$/g, '').trim())
    .find((part) => part.length > 0) ?? ''
}

function normalizePlace(place: string): string {
  const m = AIRPORT_ONLY.exec(place)
  if (!m) return place
  return m[1] ? `${AIRPORT} (${m[1].toUpperCase()})` : AIRPORT
}

function isAirport(place: string): boolean {
  return AIRPORT_ONLY.test(place) || place.startsWith(AIRPORT)
}

function parseSegment(seg: string, header: string, defaultDirection: Direction | null, sentAt: number): RideDraft | null {
  const times = findTimes(seg)
  if (times.length !== 1 || times[0].relative) return null
  const time = times[0]
  const date = findDate(seg) ?? findDate(header)

  let rest = seg
  rest = rest.replace(time.text, ' ')
  if (date && seg.includes(date.text)) rest = rest.replace(date.text, ' ')

  let isFree = has(FREE_WORD, seg) || has(FREE_WORD, header)
  let price: number | null = null
  const freeCk = new RegExp(FREE_CK.source, 'iu').exec(rest) ?? new RegExp(FREE_CK.source, 'iu').exec(header)
  if (freeCk) {
    isFree = true
    if (freeCk[1] && rest.includes(freeCk[0])) price = Number(freeCk[1]) * 1000
    rest = rest.replace(freeCk[0], ' ')
  }
  rest = rest.replace(FEE, ' ').replace(RATE, ' ').replace(FREE_WORD, ' ')

  const prices: number[] = []
  for (const { re, read } of PRICES) {
    rest = rest.replace(re, (...args) => {
      const value = read(args as unknown as RegExpMatchArray)
      if (value >= 10_000) prices.push(value)
      return ' '
    })
  }
  if (price === null) {
    const distinct = [...new Set(prices)]
    price = distinct.length === 1 ? distinct[0] : null
  }

  let seats: number | null = null
  for (const re of SEATS) {
    rest = rest.replace(re, (whole, n: string) => {
      const value = Number(n)
      if (!VALID_SEATS.has(value)) return whole
      seats ??= value
      return ' '
    })
  }
  const vehicle = VEHICLE.exec(rest)
  const vehicleNote = vehicle ? vehicle[0].toLowerCase().replace(/\s+/g, '').replace('limousine', 'limo') : null
  if (vehicle) rest = rest.replace(vehicle[0], ' ')

  const hasTien = has(TIEN, seg)
  const hasDon = has(DON, seg)
  if (hasTien && hasDon) return null
  rest = rest.replace(TIEN, ' ').replace(DON, ' ')

  let direction: Direction | null
  let pickup: string
  let destination: string

  const sep = SEPARATOR.exec(rest)
  if (sep) {
    pickup = normalizePlace(clean(rest.slice(0, sep.index)))
    destination = normalizePlace(clean(rest.slice(sep.index + sep[0].length)))
    direction = isAirport(pickup) ? 'from_airport' : isAirport(destination) ? 'to_airport' : 'other'
  } else {
    const keyword: Direction | null = hasTien ? 'to_airport' : hasDon ? 'from_airport' : defaultDirection
    const place = clean(rest.replace(AIRPORT_TOKEN, ' '))
    if (keyword === 'to_airport') {
      pickup = place
      destination = AIRPORT
    } else if (keyword === 'from_airport' && has(AIRPORT_TOKEN, seg)) {
      pickup = AIRPORT
      destination = place
    } else {
      return null
    }
    direction = keyword
  }

  if (!pickup || !destination) return null

  return {
    direction, pickup, destination,
    pickupAt: resolvePickupAt(sentAt, time.hour, time.minute, date?.day, date?.month),
    pickupTimeText: time.text,
    seats, vehicleNote, price, isFree,
    rawText: seg.trim(),
  }
}

export function parseRides(content: string, sentAt: number): ParseOutcome {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  let header = ''
  const segments: string[] = []
  for (const line of lines) {
    if (findTimes(line).length > 0) segments.push(line)
    else if (segments.length > 0) segments[segments.length - 1] += ` ${line}`
    else header += ` ${line}`
  }

  if (segments.length === 0) {
    const hasPrice = PRICES.some(({ re }) => has(re, content))
    return hasPrice ? { kind: 'unsure' } : { kind: 'not_ride' }
  }

  // Chiều mặc định khi cả tin chỉ có một loại từ khoá ("Tiễn" ở dòng đầu, dòng sau không nhắc lại).
  const tien = has(TIEN, content)
  const don = has(DON, content)
  const defaultDirection: Direction | null = tien && !don ? 'to_airport' : null

  const rides: RideDraft[] = []
  for (const seg of segments) {
    const ride = parseSegment(seg, header, defaultDirection, sentAt)
    if (!ride) return { kind: 'unsure' }
    rides.push(ride)
  }
  return { kind: 'rides', rides }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck sạch. Nếu một mẫu tin ra khác mong đợi, sửa quy tắc (không sửa mong đợi) trừ khi mong đợi sai với nghĩa của tin — khi đó ghi ruling.

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/parser/time.ts zalo-service/src/parser/rules.ts zalo-service/test/time.test.ts zalo-service/test/rules.test.ts
git commit -m "feat(zalo-service): tách cuốc bằng quy tắc — giờ VN, nhiều cuốc/tin, giá, chỗ, chiều sân bay; tin mơ hồ để AI"
```

---

### Task 5: Service — bảng cuốc (hộp thư đi) và mã QR người bắn

**Files:**
- Create: `zalo-service/src/rides.ts`
- Create: `zalo-service/src/senders.ts`
- Test: `zalo-service/test/rides.test.ts`, `zalo-service/test/senders.test.ts`

**Interfaces:**
- Consumes: `RideDraft`, `Direction` (Task 4), `openDb` v2, `MessageStore` (Task 3), `normalize`, `contentHash` (`src/text.ts`).
- Produces:
  - `interface RideSource { messageId: number; senderUid: string; groupId: string; sentAt: number }`.
  - `class RideStore(db, opts: { expireAfterPickupMs: number; expireWithoutTimeMs: number; now?: () => number; uid?: () => string })`:
    - `upsertDrafts(source, drafts: RideDraft[]): { created: number; merged: number }` — gộp theo `fingerprint` khi cuốc cũ còn hạn (tăng `group_count`).
    - `addRaw(source, rawText: string): void` — cuốc nguyên văn (`is_raw = 1`).
    - `bumpForDuplicate(senderUid: string, contentHash: string): number` — tin trùng của một tin đã thành cuốc → tăng `group_count` các cuốc còn hạn của tin gốc.
    - `markSenderChanged(senderUid: string): number` — cuốc còn hạn của người bắn cần gửi lại (mã QR mới).
    - `unsynced(limit: number): RidePayload[]`, `markSynced(rideUids: string[], at: number): void`, `backlog(): number`, `prune(now?: number): number` (xoá cuốc hết hạn quá 1 ngày).
    - `RidePayload` đúng định dạng endpoint Task 1.
  - `class SenderStore(db)`: `qr(uid): { code: string | null; fetchedAt: number | null; status: 'ok' | 'empty' | 'error' | null }`, `saveQr(uid, code: string | null, status: 'ok' | 'empty' | 'error', at: number): void`.

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/rides.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { contentHash } from '../src/text.js'
import { AIRPORT, type RideDraft } from '../src/parser/rules.js'

const HOUR = 3_600_000
const T0 = 1_759_500_000_000

function setup() {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  let t = T0
  let n = 0
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => t, uid: () => `r${++n}` })
  messages.save({ group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: 'm1', sender_uid: '111', sender_name: 'Đức', content: 'tiễn 5h phố cổ', sent_at: T0 }, 'acc1')
  const source = { messageId: messages.findId('g1', 'm1')!, senderUid: '111', groupId: 'g1', sentAt: T0 }
  return { db, messages, rides, source, setNow: (v: number) => { t = v } }
}

function draft(overrides: Partial<RideDraft> = {}): RideDraft {
  return {
    direction: 'to_airport', pickup: 'phố cổ', destination: AIRPORT, pickupAt: T0 + 2 * HOUR, pickupTimeText: '5h',
    seats: 5, vehicleNote: null, price: 200000, isFree: false, rawText: 'tiễn 5h phố cổ', ...overrides,
  }
}

test('creates a ride with expiry 30 minutes after pickup and a full payload', () => {
  const { rides, source } = setup()
  assert.deepEqual(rides.upsertDrafts(source, [draft()]), { created: 1, merged: 0 })
  const [p] = rides.unsynced(10)
  assert.equal(p.ride_uid, 'r1')
  assert.equal(p.sender_name, 'Đức')
  assert.equal(p.group_name, 'Taxi Nội Bài')
  assert.equal(p.qr_code, null)
  assert.equal(p.expires_at, T0 + 2 * HOUR + 30 * 60_000)
  assert.equal(p.is_free, false)
  assert.equal(p.group_count, 1)
})

test('a ride without time expires 3 hours after posting', () => {
  const { rides, source } = setup()
  rides.addRaw(source, 'tin khó hiểu')
  const [p] = rides.unsynced(10)
  assert.equal(p.is_raw, true)
  assert.equal(p.expires_at, T0 + 3 * HOUR)
})

test('multi-ride message creates two rides', () => {
  const { rides, source } = setup()
  assert.deepEqual(rides.upsertDrafts(source, [draft(), draft({ pickup: 'Tương Mai', pickupAt: T0 + 3 * HOUR })]), { created: 2, merged: 0 })
  assert.equal(rides.backlog(), 2)
})

test('the same ride reposted (reformatted) merges and bumps group_count', () => {
  const { rides, source } = setup()
  rides.upsertDrafts(source, [draft()])
  assert.deepEqual(rides.upsertDrafts({ ...source, groupId: 'g2' }, [draft({ pickup: 'Phố  Cổ' })]), { created: 0, merged: 1 })
  assert.equal(rides.unsynced(10)[0].group_count, 2)
})

test('a duplicate message bumps the original rides', () => {
  const { rides, messages, source } = setup()
  rides.upsertDrafts(source, [draft()])
  messages.setStatus(source.messageId, 'ride')
  assert.equal(rides.bumpForDuplicate('111', contentHash('111', 'tiễn 5h phố cổ')), 1)
  assert.equal(rides.unsynced(10)[0].group_count, 2)
})

test('sync bookkeeping: synced rides leave the outbox, updated rides come back', () => {
  const { rides, source, setNow } = setup()
  rides.upsertDrafts(source, [draft()])
  rides.markSynced(['r1'], T0)
  assert.equal(rides.backlog(), 0)
  setNow(T0 + 1000)
  assert.equal(rides.markSenderChanged('111'), 1)
  assert.deepEqual(rides.unsynced(10).map((r) => r.ride_uid), ['r1'])
})

test('prune removes rides expired over a day', () => {
  const { rides, source } = setup()
  rides.upsertDrafts(source, [draft({ pickupAt: T0 - 30 * HOUR })])
  assert.equal(rides.prune(T0), 1)
})
```

`zalo-service/test/senders.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { SenderStore } from '../src/senders.js'

test('qr info round-trip, unknown sender returns nulls', () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức')").run()
  const senders = new SenderStore(db)

  assert.deepEqual(senders.qr('111'), { code: null, fetchedAt: null, status: null })
  senders.saveQr('111', '758z6tl22yft', 'ok', 5000)
  assert.deepEqual(senders.qr('111'), { code: '758z6tl22yft', fetchedAt: 5000, status: 'ok' })
  assert.deepEqual(senders.qr('999'), { code: null, fetchedAt: null, status: null })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/rides.js'` / `senders.js`

- [ ] **Step 3: Implement**

`zalo-service/src/rides.ts`:

```ts
import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Db } from './db.js'
import type { Direction, RideDraft } from './parser/rules.js'
import { contentHash, normalize } from './text.js'

export interface RideSource {
  messageId: number
  senderUid: string
  groupId: string
  sentAt: number
}

// Đúng định dạng POST /api/internal/zalo/rides (Laravel ZaloRideIngestService).
export interface RidePayload {
  ride_uid: string
  sender_uid: string
  sender_name: string
  qr_code: string | null
  zalo_group_id: string
  group_name: string
  direction: Direction | null
  pickup: string | null
  destination: string | null
  pickup_at: number | null
  pickup_time_text: string | null
  seats: number | null
  vehicle_note: string | null
  price: number | null
  is_free: boolean
  is_raw: boolean
  raw_text: string
  group_count: number
  posted_at: number
  expires_at: number
}

const HALF_HOUR = 30 * 60_000
const DAY = 24 * 3_600_000

/**
 * Hộp thư đi: cuốc sạch chờ gửi Laravel. Cuốc "cần gửi" khi chưa đồng bộ hoặc đổi sau lần đồng bộ cuối
 * (updated_at > synced_at). Cùng người bắn + chiều + điểm đón/đến + khung 30 phút = một cuốc (gộp, tăng group_count).
 */
export class RideStore {
  private readonly now: () => number
  private readonly uid: () => string
  private readonly findByFp: Database.Statement
  private readonly bump: Database.Statement
  private readonly insert: Database.Statement
  private readonly bumpDup: Database.Statement
  private readonly senderChanged: Database.Statement
  private readonly selectUnsynced: Database.Statement
  private readonly countBacklog: Database.Statement
  private readonly deleteOld: Database.Statement
  private readonly upsertTx: (source: RideSource, drafts: RideDraft[]) => { created: number; merged: number }

  constructor(private readonly db: Db, private readonly opts: { expireAfterPickupMs: number; expireWithoutTimeMs: number; now?: () => number; uid?: () => string }) {
    this.now = opts.now ?? (() => Date.now())
    this.uid = opts.uid ?? (() => randomUUID())
    this.findByFp = db.prepare('SELECT id FROM rides WHERE fingerprint = ? AND expires_at > ? LIMIT 1')
    this.bump = db.prepare('UPDATE rides SET group_count = group_count + 1, updated_at = ? WHERE id = ?')
    this.insert = db.prepare(`
      INSERT INTO rides (ride_uid, message_id, sender_uid, zalo_group_id, direction, pickup, destination, pickup_at,
        pickup_time_text, seats, vehicle_note, price, is_free, is_raw, raw_text, fingerprint, posted_at, expires_at, updated_at)
      VALUES (@ride_uid, @message_id, @sender_uid, @zalo_group_id, @direction, @pickup, @destination, @pickup_at,
        @pickup_time_text, @seats, @vehicle_note, @price, @is_free, @is_raw, @raw_text, @fingerprint, @posted_at, @expires_at, @updated_at)`)
    this.bumpDup = db.prepare(`
      UPDATE rides SET group_count = group_count + 1, updated_at = ?
      WHERE expires_at > ? AND message_id IN (
        SELECT id FROM messages WHERE sender_uid = ? AND content_hash = ? AND parse_status IN ('ride', 'raw'))`)
    this.senderChanged = db.prepare('UPDATE rides SET updated_at = ? WHERE sender_uid = ? AND expires_at > ?')
    this.selectUnsynced = db.prepare(`
      SELECT r.*, COALESCE(s.display_name, '') AS sender_name, s.qr_code AS qr_code, COALESCE(g.name, '') AS group_name
      FROM rides r
      LEFT JOIN senders s ON s.uid = r.sender_uid
      LEFT JOIN chat_groups g ON g.zalo_group_id = r.zalo_group_id
      WHERE r.synced_at IS NULL OR r.updated_at > r.synced_at
      ORDER BY r.updated_at
      LIMIT ?`)
    this.countBacklog = db.prepare('SELECT COUNT(*) AS c FROM rides WHERE synced_at IS NULL OR updated_at > synced_at')
    this.deleteOld = db.prepare('DELETE FROM rides WHERE expires_at < ?')

    this.upsertTx = db.transaction((source: RideSource, drafts: RideDraft[]) => {
      let created = 0
      let merged = 0
      const now = this.now()
      for (const draft of drafts) {
        const fingerprint = this.fingerprint(source.senderUid, draft)
        const existing = this.findByFp.get(fingerprint, now) as { id: number } | undefined
        if (existing) {
          this.bump.run(now, existing.id)
          merged++
          continue
        }
        this.insertRow(source, draft, fingerprint, false, now)
        created++
      }
      return { created, merged }
    })
  }

  upsertDrafts(source: RideSource, drafts: RideDraft[]): { created: number; merged: number } {
    return this.upsertTx(source, drafts)
  }

  addRaw(source: RideSource, rawText: string): void {
    const draft: RideDraft = {
      direction: null, pickup: null, destination: null, pickupAt: null, pickupTimeText: null,
      seats: null, vehicleNote: null, price: null, isFree: false, rawText,
    }
    this.insertRow(source, draft, `raw|${contentHash(source.senderUid, rawText)}`, true, this.now())
  }

  bumpForDuplicate(senderUid: string, hash: string): number {
    const now = this.now()
    return this.bumpDup.run(now, now, senderUid, hash).changes
  }

  markSenderChanged(senderUid: string): number {
    const now = this.now()
    return this.senderChanged.run(now, senderUid, now).changes
  }

  unsynced(limit: number): RidePayload[] {
    return (this.selectUnsynced.all(limit) as Record<string, unknown>[]).map((r) => ({
      ride_uid: r.ride_uid as string,
      sender_uid: r.sender_uid as string,
      sender_name: r.sender_name as string,
      qr_code: (r.qr_code as string | null) ?? null,
      zalo_group_id: r.zalo_group_id as string,
      group_name: r.group_name as string,
      direction: (r.direction as Direction | null) ?? null,
      pickup: (r.pickup as string | null) ?? null,
      destination: (r.destination as string | null) ?? null,
      pickup_at: (r.pickup_at as number | null) ?? null,
      pickup_time_text: (r.pickup_time_text as string | null) ?? null,
      seats: (r.seats as number | null) ?? null,
      vehicle_note: (r.vehicle_note as string | null) ?? null,
      price: (r.price as number | null) ?? null,
      is_free: r.is_free === 1,
      is_raw: r.is_raw === 1,
      raw_text: r.raw_text as string,
      group_count: r.group_count as number,
      posted_at: r.posted_at as number,
      expires_at: r.expires_at as number,
    }))
  }

  // at = thời điểm lấy lô (trước khi gửi): cuốc đổi trong lúc đang gửi có updated_at > at → gửi lại lượt sau.
  markSynced(rideUids: string[], at: number): void {
    if (rideUids.length === 0) return
    const placeholders = rideUids.map(() => '?').join(',')
    this.db.prepare(`UPDATE rides SET synced_at = ? WHERE ride_uid IN (${placeholders})`).run(at, ...rideUids)
  }

  backlog(): number {
    return (this.countBacklog.get() as { c: number }).c
  }

  prune(now: number = this.now()): number {
    return this.deleteOld.run(now - DAY).changes
  }

  private fingerprint(senderUid: string, draft: RideDraft): string {
    const slot = draft.pickupAt === null ? '' : String(Math.round(draft.pickupAt / HALF_HOUR))
    const key = [senderUid, draft.direction ?? '', normalize(draft.pickup ?? ''), normalize(draft.destination ?? ''), slot].join('|')
    return createHash('sha256').update(key).digest('hex')
  }

  private insertRow(source: RideSource, draft: RideDraft, fingerprint: string, isRaw: boolean, now: number): void {
    const expiresAt = draft.pickupAt !== null ? draft.pickupAt + this.opts.expireAfterPickupMs : source.sentAt + this.opts.expireWithoutTimeMs
    this.insert.run({
      ride_uid: this.uid(),
      message_id: source.messageId,
      sender_uid: source.senderUid,
      zalo_group_id: source.groupId,
      direction: draft.direction,
      pickup: draft.pickup,
      destination: draft.destination,
      pickup_at: draft.pickupAt,
      pickup_time_text: draft.pickupTimeText,
      seats: draft.seats,
      vehicle_note: draft.vehicleNote,
      price: draft.price,
      is_free: draft.isFree ? 1 : 0,
      is_raw: isRaw ? 1 : 0,
      raw_text: draft.rawText,
      fingerprint,
      posted_at: source.sentAt,
      expires_at: expiresAt,
      updated_at: now,
    })
  }
}
```

`zalo-service/src/senders.ts`:

```ts
import type Database from 'better-sqlite3'
import type { Db } from './db.js'

export type QrStatus = 'ok' | 'empty' | 'error'

export class SenderStore {
  private readonly getQr: Database.Statement
  private readonly setQr: Database.Statement

  constructor(db: Db) {
    this.getQr = db.prepare('SELECT qr_code, qr_fetched_at, qr_status FROM senders WHERE uid = ?')
    this.setQr = db.prepare('UPDATE senders SET qr_code = ?, qr_status = ?, qr_fetched_at = ? WHERE uid = ?')
  }

  qr(uid: string): { code: string | null; fetchedAt: number | null; status: QrStatus | null } {
    const row = this.getQr.get(uid) as { qr_code: string | null; qr_fetched_at: number | null; qr_status: QrStatus | null } | undefined
    return { code: row?.qr_code ?? null, fetchedAt: row?.qr_fetched_at ?? null, status: row?.qr_status ?? null }
  }

  // Lỗi tạm thời (status 'error') giữ lại mã cũ nếu đã có.
  saveQr(uid: string, code: string | null, status: QrStatus, at: number): void {
    const keep = status === 'error' ? this.qr(uid).code : code
    this.setQr.run(keep, status, at, uid)
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck sạch

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/rides.ts zalo-service/src/senders.ts zalo-service/test/rides.test.ts zalo-service/test/senders.test.ts
git commit -m "feat(zalo-service): bảng cuốc làm hộp thư đi — gộp theo fingerprint, hết hạn, gửi lại khi đổi; lưu mã QR người bắn"
```

---

### Task 6: Service — AI tách cuốc (Claude Haiku), chi phí theo ngày, hàng chờ AI

**Files:**
- Create: `zalo-service/src/ai/usage.ts`
- Create: `zalo-service/src/ai/extractor.ts`
- Create: `zalo-service/src/ai/queue.ts`
- Test: `zalo-service/test/ai-usage.test.ts`, `zalo-service/test/ai-extractor.test.ts`, `zalo-service/test/ai-queue.test.ts`

**Interfaces:**
- Consumes: `RideDraft`, `AIRPORT` (Task 4), `resolvePickupAt` (Task 4), `openDb` v2.
- Produces:
  - `class AiUsage(db, now?)`: `record(inputTokens, outputTokens): number` (trả chi phí USD lần gọi), `spentToday(): number`, `vnDay(ms): string` (`YYYY-MM-DD` giờ VN). Giá: $1 / 1M token vào, $5 / 1M token ra.
  - `interface AiItem { id: number; content: string; sentAt: number }`, `interface AiOutcome { id: number; isRide: boolean; rides: RideDraft[] }`, `interface Extractor { extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }> }`.
  - `class AnthropicExtractor implements Extractor` — `constructor(client: Anthropic, model: string)`; dùng `client.messages.parse` + `output_config.format: zodOutputFormat(ResultSchema)`.
  - `class AiQueue({ extractor, usage, budgetUsd: () => number, onOutcome, onOverBudget, onFailed, batchSize?, maxAttempts?, retryPauseMs?, logger, now? })`: `enqueue(item)`, `flush(): Promise<void>` (không chạy chồng), `size`.

- [ ] **Step 1: Install dependencies**

Run:

```bash
cd zalo-service
npm install @anthropic-ai/sdk zod
npm ls zod @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` và `zod` có trong `dependencies`; `npm ls` không báo `invalid` / `peer dep missing` (SDK yêu cầu `zod ^3.25 || ^4`).

- [ ] **Step 2: Write the failing tests**

`zalo-service/test/ai-usage.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'

test('records cost per call and sums per Vietnam day', () => {
  let t = Date.parse('2026-10-04T16:00:00Z') // 23:00 giờ VN ngày 04/10
  const usage = new AiUsage(openDb(':memory:'), () => t)

  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`)
  near(usage.record(1_000_000, 0), 1)
  near(usage.record(0, 200_000), 1)
  near(usage.spentToday(), 2)

  t += 2 * 3_600_000 // 01:00 giờ VN ngày 05/10 → ngày mới
  assert.equal(usage.spentToday(), 0)
  assert.equal(usage.vnDay(t), '2026-10-05')
  assert.equal(usage.vnDay(Date.parse('2026-10-04T16:59:59Z')), '2026-10-04')
})
```

`zalo-service/test/ai-extractor.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicExtractor } from '../src/ai/extractor.js'

const VN = 7 * 3_600_000
const SENT = Date.parse('2026-10-04T01:30:00Z') - VN

function fakeClient(parsedOutput: unknown, capture?: (params: Record<string, unknown>) => void) {
  return {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        capture?.(params)
        return { parsed_output: parsedOutput, stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 300 } }
      },
    },
  } as unknown as Anthropic
}

test('maps AI rides to drafts, resolving time in Vietnam time', async () => {
  let params: Record<string, unknown> = {}
  const extractor = new AnthropicExtractor(fakeClient({
    results: [
      { id: 7, is_ride: true, rides: [{ direction: 'to_airport', pickup: '89 Quan Nhân', destination: 'Sân bay Nội Bài', pickup_time: '08:30', pickup_date: null, seats: 7, vehicle_note: 'vf6', price_vnd: 600000, is_free: false }] },
      { id: 8, is_ride: false, rides: [] },
    ],
  }, (p) => { params = p }), 'claude-haiku-4-5')

  const out = await extractor.extract([{ id: 7, content: "8h30' tiễn 89 Quan Nhân ...", sentAt: SENT }, { id: 8, content: 'chào cả nhà', sentAt: SENT }])

  assert.equal(params.model, 'claude-haiku-4-5')
  assert.ok(params.output_config)
  assert.deepEqual({ inputTokens: out.inputTokens, outputTokens: out.outputTokens }, { inputTokens: 1200, outputTokens: 300 })
  const ride = out.outcomes[0].rides[0]
  assert.equal(out.outcomes[0].isRide, true)
  assert.equal(ride.pickup, '89 Quan Nhân')
  assert.equal(new Date(ride.pickupAt! + VN).toISOString().slice(0, 16), '2026-10-04T08:30')
  assert.equal(ride.seats, 7)
  assert.equal(ride.price, 600000)
  assert.equal(ride.rawText, "8h30' tiễn 89 Quan Nhân ...")
  assert.deepEqual(out.outcomes[1], { id: 8, isRide: false, rides: [] })
})

test('missing ids in the AI answer are treated as not rides', async () => {
  const extractor = new AnthropicExtractor(fakeClient({ results: [] }), 'claude-haiku-4-5')
  const out = await extractor.extract([{ id: 1, content: 'x', sentAt: SENT }])
  assert.deepEqual(out.outcomes, [{ id: 1, isRide: false, rides: [] }])
})

test('an unparseable answer throws so the batch is retried', async () => {
  const extractor = new AnthropicExtractor(fakeClient(null), 'claude-haiku-4-5')
  await assert.rejects(extractor.extract([{ id: 1, content: 'x', sentAt: SENT }]), /không trả kết quả hợp lệ/)
})
```

`zalo-service/test/ai-queue.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { AiQueue, type Extractor } from '../src/ai/queue.js'
import { silentLogger } from '../src/logger.js'

function harness(extract: Extractor['extract'], budget = 5) {
  let t = 1_000_000
  const usage = new AiUsage(openDb(':memory:'), () => t)
  const outcomes: number[] = []
  const over: number[] = []
  const failed: number[] = []
  const batches: number[][] = []
  const queue = new AiQueue({
    extractor: { extract: async (items) => { batches.push(items.map((i) => i.id)); return extract(items) } },
    usage, budgetUsd: () => budget,
    onOutcome: (o) => outcomes.push(o.id), onOverBudget: (id) => over.push(id), onFailed: (id) => failed.push(id),
    batchSize: 2, maxAttempts: 3, retryPauseMs: 100, logger: silentLogger, now: () => t,
  })
  return { queue, usage, outcomes, over, failed, batches, advance: (ms: number) => { t += ms } }
}

const ok: Extractor['extract'] = async (items) => ({ outcomes: items.map((i) => ({ id: i.id, isRide: false, rides: [] })), inputTokens: 100, outputTokens: 10 })

test('sends at most batchSize items per call and records usage', async () => {
  const h = harness(ok)
  for (const id of [1, 2, 3]) h.queue.enqueue({ id, content: 'x', sentAt: 0 })
  await h.queue.flush()
  await h.queue.flush()
  assert.deepEqual(h.batches, [[1, 2], [3]])
  assert.deepEqual(h.outcomes, [1, 2, 3])
  assert.ok(h.usage.spentToday() > 0)
})

test('over budget: items become raw rides without calling AI', async () => {
  const h = harness(ok, 0)
  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.deepEqual(h.batches, [])
  assert.deepEqual(h.over, [1])
})

test('failed batches are retried then given up', async () => {
  const h = harness(async () => { throw new Error('529 overloaded') })
  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  await h.queue.flush()
  await h.queue.flush() // còn trong thời gian tạm dừng → không gọi
  assert.equal(h.batches.length, 1)
  h.advance(100); await h.queue.flush()
  h.advance(100); await h.queue.flush()
  assert.equal(h.batches.length, 3)
  assert.deepEqual(h.failed, [1])
  assert.equal(h.queue.size, 0)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/ai/usage.js'` (và `extractor.js`, `queue.js`)

- [ ] **Step 4: Implement**

`zalo-service/src/ai/usage.ts`:

```ts
import type Database from 'better-sqlite3'
import type { Db } from '../db.js'

const VN_OFFSET_MS = 7 * 3_600_000
// Claude Haiku 4.5: $1 / 1 triệu token vào, $5 / 1 triệu token ra.
const INPUT_USD_PER_TOKEN = 1 / 1_000_000
const OUTPUT_USD_PER_TOKEN = 5 / 1_000_000

// Chi phí AI theo ngày giờ Việt Nam — dùng cho trần ngân sách và heartbeat.
export class AiUsage {
  private readonly upsert: Database.Statement
  private readonly select: Database.Statement

  constructor(db: Db, private readonly now: () => number = () => Date.now()) {
    this.upsert = db.prepare(`
      INSERT INTO ai_usage (day, calls, input_tokens, output_tokens, cost_usd) VALUES (?, 1, ?, ?, ?)
      ON CONFLICT (day) DO UPDATE SET calls = calls + 1, input_tokens = input_tokens + excluded.input_tokens,
        output_tokens = output_tokens + excluded.output_tokens, cost_usd = cost_usd + excluded.cost_usd`)
    this.select = db.prepare('SELECT cost_usd FROM ai_usage WHERE day = ?')
  }

  vnDay(ms: number): string {
    return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10)
  }

  record(inputTokens: number, outputTokens: number): number {
    const cost = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN
    this.upsert.run(this.vnDay(this.now()), inputTokens, outputTokens, cost)
    return cost
  }

  spentToday(): number {
    return (this.select.get(this.vnDay(this.now())) as { cost_usd: number } | undefined)?.cost_usd ?? 0
  }
}
```

`zalo-service/src/ai/extractor.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { resolvePickupAt } from '../parser/time.js'
import type { RideDraft } from '../parser/rules.js'
import type { AiItem, AiOutcome, Extractor } from './queue.js'

const RideSchema = z.object({
  direction: z.enum(['to_airport', 'from_airport', 'other']),
  pickup: z.string().nullable(),
  destination: z.string().nullable(),
  pickup_time: z.string().nullable(),
  pickup_date: z.string().nullable(),
  seats: z.number().int().nullable(),
  vehicle_note: z.string().nullable(),
  price_vnd: z.number().int().nullable(),
  is_free: z.boolean(),
})

const ResultSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), is_ride: z.boolean(), rides: z.array(RideSchema) })),
})

// Prompt cố định (không chèn giờ/ID động) — mọi lô dùng chung một tiền tố.
const SYSTEM_PROMPT = `Bạn tách thông tin cuốc xe từ tin nhắn trong các nhóm Zalo bắn cuốc xe sân bay Nội Bài (Hà Nội).
Với mỗi tin (có "id"), trả is_ride=false nếu là tán gẫu, hỏi han, quảng cáo, tìm khách, xin việc hoặc không đủ thông tin một chuyến đi.
Một tin có thể chứa nhiều cuốc (mỗi dòng một giờ khác nhau) → trả nhiều phần tử trong rides.
Thuật ngữ:
- "tiễn" = chở khách ra sân bay Nội Bài (direction=to_airport, destination="Sân bay Nội Bài").
- "đón" ở sân bay = đón khách từ sân bay (direction=from_airport, pickup="Sân bay Nội Bài"). "T1", "T2", "NB", "sb" = sân bay Nội Bài.
- Không liên quan sân bay → direction=other.
- Giá: "200k"=200000, "1tr2"=1200000, "280,000đ"=280000. "1k" thường là 1 khách, không phải giá.
- "ck", "TK 0.25" là chiết khấu/phí cho người bắn, không phải giá. "free", "feee", "ko thu ck" = không thu chiết khấu → is_free=true.
- "xe 5", "5c", "5 chỗ" → seats=5. "limo", "vf8", "x7" → vehicle_note.
- Giờ: trả pickup_time dạng "HH:MM" (24h). "15-16h" → "15:00". "0-30p" (trong 30 phút) hoặc không có giờ → null. Ngày "4/10" → pickup_date "04/10".
Giữ nguyên tên địa điểm như trong tin, không tự bịa thông tin không có.`

function toDraft(r: z.infer<typeof RideSchema>, item: AiItem): RideDraft {
  let pickupAt: number | null = null
  const time = r.pickup_time ? /^(\d{1,2}):(\d{2})$/.exec(r.pickup_time) : null
  if (time) {
    const date = r.pickup_date ? /^(\d{1,2})\/(\d{1,2})$/.exec(r.pickup_date) : null
    pickupAt = resolvePickupAt(item.sentAt, Number(time[1]), Number(time[2]), date ? Number(date[1]) : null, date ? Number(date[2]) : null)
  }
  return {
    direction: r.direction,
    pickup: r.pickup,
    destination: r.destination,
    pickupAt,
    pickupTimeText: r.pickup_time,
    seats: r.seats,
    vehicleNote: r.vehicle_note,
    price: r.price_vnd,
    isFree: r.is_free,
    rawText: item.content,
  }
}

export class AnthropicExtractor implements Extractor {
  constructor(private readonly client: Anthropic, private readonly model: string) {}

  async extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(items.map((i) => ({ id: i.id, text: i.content }))) }],
      output_config: { format: zodOutputFormat(ResultSchema) },
    })

    const parsed = response.parsed_output
    if (!parsed) throw new Error(`AI không trả kết quả hợp lệ (stop_reason ${response.stop_reason})`)

    const outcomes = items.map((item): AiOutcome => {
      const r = parsed.results.find((x) => x.id === item.id)
      if (!r || !r.is_ride || r.rides.length === 0) return { id: item.id, isRide: false, rides: [] }
      return { id: item.id, isRide: true, rides: r.rides.map((ride) => toDraft(ride, item)) }
    })
    return { outcomes, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  }
}
```

`zalo-service/src/ai/queue.ts`:

```ts
import type { Logger } from '../logger.js'
import type { RideDraft } from '../parser/rules.js'
import type { AiUsage } from './usage.js'

export interface AiItem {
  id: number
  content: string
  sentAt: number
}

export interface AiOutcome {
  id: number
  isRide: boolean
  rides: RideDraft[]
}

export interface Extractor {
  extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }>
}

/**
 * Hàng chờ AI: gom tin khó thành lô (≤ batchSize), gọi tuần tự, tôn trọng trần ngân sách theo ngày.
 * Lô lỗi: tạm dừng retryPauseMs rồi thử lại; mỗi tin tối đa maxAttempts lần rồi báo onFailed.
 * Hẹn giờ gọi flush() mỗi aiFlushMs nằm ở index.ts (gom tối đa ~3 giây).
 */
export class AiQueue {
  private readonly items: AiItem[] = []
  private readonly attempts = new Map<number, number>()
  private running = false
  private pausedUntil = 0

  constructor(
    private readonly deps: {
      extractor: Extractor
      usage: AiUsage
      budgetUsd: () => number
      onOutcome: (outcome: AiOutcome) => void
      onOverBudget: (id: number) => void
      onFailed: (id: number) => void
      batchSize?: number
      maxAttempts?: number
      retryPauseMs?: number
      logger: Logger
      now?: () => number
    },
  ) {}

  get size(): number {
    return this.items.length
  }

  enqueue(item: AiItem): void {
    this.items.push(item)
  }

  async flush(): Promise<void> {
    const now = (this.deps.now ?? Date.now)()
    if (this.running || this.items.length === 0 || now < this.pausedUntil) return

    if (this.deps.usage.spentToday() >= this.deps.budgetUsd()) {
      for (const item of this.items.splice(0)) this.deps.onOverBudget(item.id)
      return
    }

    this.running = true
    const batch = this.items.splice(0, this.deps.batchSize ?? 20)
    try {
      const { outcomes, inputTokens, outputTokens } = await this.deps.extractor.extract(batch)
      this.deps.usage.record(inputTokens, outputTokens)
      for (const outcome of outcomes) {
        this.attempts.delete(outcome.id)
        this.deps.onOutcome(outcome)
      }
    } catch (err) {
      this.deps.logger.error(`Gọi AI lỗi (${batch.length} tin):`, err instanceof Error ? err.message : err)
      this.pausedUntil = now + (this.deps.retryPauseMs ?? 30_000)
      for (const item of batch) {
        const tries = (this.attempts.get(item.id) ?? 0) + 1
        if (tries >= (this.deps.maxAttempts ?? 3)) {
          this.attempts.delete(item.id)
          this.deps.onFailed(item.id)
        } else {
          this.attempts.set(item.id, tries)
          this.items.push(item)
        }
      }
    } finally {
      this.running = false
    }
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck sạch. Nếu typecheck báo kiểu tham số `messages.parse` / `output_config` khác, đối chiếu `node_modules/@anthropic-ai/sdk/resources/messages` và tài liệu skill claude-api (`typescript/claude-api/tool-use.md` mục Structured Outputs) — không đoán tên.

- [ ] **Step 6: Commit**

```bash
git add zalo-service/package.json zalo-service/package-lock.json zalo-service/src/ai/usage.ts zalo-service/src/ai/extractor.ts zalo-service/src/ai/queue.ts zalo-service/test/ai-usage.test.ts zalo-service/test/ai-extractor.test.ts zalo-service/test/ai-queue.test.ts
git commit -m "feat(zalo-service): AI tách cuốc bằng Claude Haiku (structured output), hàng chờ gom lô, trần ngân sách theo ngày VN"
```

---

### Task 7: Service — lấy mã QR người bắn

**Files:**
- Create: `zalo-service/src/qr.ts`
- Modify: `zalo-service/src/accounts.ts` (thêm `getQR` vào `ApiLike`)
- Modify: `zalo-service/test/accounts.test.ts` (fake api có `getQR`)
- Test: `zalo-service/test/qr.test.ts`

**Interfaces:**
- Consumes: `SenderStore`, `QrStatus` (Task 5).
- Produces:
  - `ApiLike.getQR(userId: string | string[]): Promise<Record<string, string>>` (zca-js 2.2.0: map uid → URL ảnh QR).
  - `extractQrCode(text: string | null): string | null` (lấy `<mã>` từ `.../qr/p/<mã>`), `decodeQrFromUrl(url: string): Promise<string | null>` (jimp + jsqr).
  - `class QrQueue({ senders, getQr, decode, onUpdated, refreshMs, errorRetryMs?, logger, now? })`: `ensure(uid)` (xếp nếu chưa có mã / quá hạn / lỗi quá `errorRetryMs`), `force(uid)` (yêu cầu từ Laravel, bỏ qua hạn), `step(): Promise<void>` (xử lý đúng một người bắn), `size`.

- [ ] **Step 1: Install dependencies**

Run: `cd zalo-service && npm install jimp jsqr`
Expected: `jimp`, `jsqr` trong `dependencies`.

- [ ] **Step 2: Write the failing tests**

`zalo-service/test/qr.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { SenderStore } from '../src/senders.js'
import { QrQueue, extractQrCode } from '../src/qr.js'
import { silentLogger } from '../src/logger.js'

const DAY = 24 * 3_600_000

function harness(opts: { qrUrl?: string; decoded?: string | null; fail?: boolean } = {}) {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức')").run()
  const senders = new SenderStore(db)
  let t = 10 * DAY
  const calls: string[] = []
  const updated: string[] = []
  const queue = new QrQueue({
    senders,
    getQr: async (uid) => { calls.push(uid); if (opts.fail) throw new Error('mạng'); return opts.qrUrl ? { [uid]: opts.qrUrl } : {} },
    decode: async () => opts.decoded ?? null,
    onUpdated: (uid) => updated.push(uid),
    refreshMs: 7 * DAY, errorRetryMs: 3_600_000, logger: silentLogger, now: () => t,
  })
  return { senders, queue, calls, updated, advance: (ms: number) => { t += ms } }
}

test('extractQrCode reads the code from a Zalo QR link', () => {
  assert.equal(extractQrCode('http://zaloapp.com/qr/p/758z6tl22yft'), '758z6tl22yft')
  assert.equal(extractQrCode('https://example.com'), null)
  assert.equal(extractQrCode(null), null)
})

test('fetches, decodes and stores the code once, then notifies', async () => {
  const h = harness({ qrUrl: 'https://qr-talk.zdn.vn/x.jpg', decoded: 'http://zaloapp.com/qr/p/758z6tl22yft' })
  h.queue.ensure('111')
  h.queue.ensure('111')
  assert.equal(h.queue.size, 1)
  await h.queue.step()
  assert.deepEqual(h.senders.qr('111').code, '758z6tl22yft')
  assert.deepEqual(h.updated, ['111'])
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0) // còn mới → không xếp lại
})

test('empty QR is not retried within the refresh period; force overrides', async () => {
  const h = harness({ qrUrl: undefined })
  h.queue.ensure('111')
  await h.queue.step()
  assert.equal(h.senders.qr('111').status, 'empty')
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0)
  h.queue.force('111')
  assert.equal(h.queue.size, 1)
})

test('errors keep the old code and retry after an hour', async () => {
  const h = harness({ fail: true })
  h.senders.saveQr('111', 'oldcode', 'ok', 0)
  h.queue.force('111')
  await h.queue.step()
  assert.deepEqual(h.senders.qr('111'), { code: 'oldcode', fetchedAt: 10 * DAY, status: 'error' })
  h.queue.ensure('111')
  assert.equal(h.queue.size, 0)
  h.advance(3_600_001)
  h.queue.ensure('111')
  assert.equal(h.queue.size, 1)
})
```

Sửa `zalo-service/test/accounts.test.ts` — trong `fakeApi()` thêm `getQR`:

```ts
function fakeApi(): ApiLike & { listener: FakeListener } {
  return { listener: new FakeListener(), getOwnId: () => 'own', getGroupInfo: async () => ({}), getQR: async () => ({}) }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/qr.js'`; typecheck lỗi ở `accounts.test.ts` vì `ApiLike` chưa có `getQR` (chạy `npm run typecheck` để thấy)

- [ ] **Step 4: Implement**

`zalo-service/src/accounts.ts` — trong `interface ApiLike` thêm:

```ts
  getQR(userId: string | string[]): Promise<Record<string, string>>
```

`zalo-service/src/qr.ts`:

```ts
import { Jimp } from 'jimp'
import jsQR from 'jsqr'
import type { Logger } from './logger.js'
import type { SenderStore } from './senders.js'

export function extractQrCode(text: string | null): string | null {
  const m = text?.match(/qr\/p\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

// Tải ảnh QR (URL do getQR trả) và giải mã ra chuỗi link. Không đọc được → null.
export async function decodeQrFromUrl(url: string): Promise<string | null> {
  const image = await Jimp.read(url)
  const code = jsQR(new Uint8ClampedArray(image.bitmap.data), image.bitmap.width, image.bitmap.height)
  return code?.data ?? null
}

/**
 * Hàng đợi lấy mã QR người bắn — mỗi step() xử lý MỘT người; index.ts gọi step() mỗi qrIntervalMs (≥ 2 giây)
 * để không dồn lời gọi lên Zalo. Chỉ lưu đoạn mã; ảnh dùng tạm rồi bỏ.
 */
export class QrQueue {
  private readonly queue: string[] = []
  private readonly queued = new Set<string>()

  constructor(
    private readonly deps: {
      senders: SenderStore
      getQr: (uid: string) => Promise<Record<string, string>>
      decode: (imageUrl: string) => Promise<string | null>
      onUpdated: (uid: string) => void
      refreshMs: number
      errorRetryMs?: number
      logger: Logger
      now?: () => number
    },
  ) {}

  get size(): number {
    return this.queue.length
  }

  ensure(uid: string): void {
    const info = this.deps.senders.qr(uid)
    const now = (this.deps.now ?? Date.now)()
    const age = info.fetchedAt === null ? Infinity : now - info.fetchedAt
    const due = info.status === 'error' ? age > (this.deps.errorRetryMs ?? 3_600_000) : age > this.deps.refreshMs
    if (due) this.push(uid)
  }

  force(uid: string): void {
    this.push(uid)
  }

  async step(): Promise<void> {
    const uid = this.queue.shift()
    if (uid === undefined) return
    this.queued.delete(uid)
    const now = (this.deps.now ?? Date.now)()

    try {
      const url = (await this.deps.getQr(uid))[uid]
      const code = url ? extractQrCode(await this.deps.decode(url)) : null
      this.deps.senders.saveQr(uid, code, code ? 'ok' : 'empty', now)
      this.deps.onUpdated(uid)
    } catch (err) {
      this.deps.logger.error(`Lấy mã QR ${uid} lỗi:`, err instanceof Error ? err.message : err)
      this.deps.senders.saveQr(uid, null, 'error', now)
    }
  }

  private push(uid: string): void {
    if (this.queued.has(uid)) return
    this.queued.add(uid)
    this.queue.push(uid)
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck sạch. Nếu typecheck báo kiểu import của `jimp` / `jsqr`, đối chiếu `node_modules/jimp/package.json` (`exports`) — script thử nghiệm ngày 04/10 đã chạy được với `import { Jimp } from 'jimp'` và `import jsQR from 'jsqr'`.

- [ ] **Step 6: Commit**

```bash
git add zalo-service/package.json zalo-service/package-lock.json zalo-service/src/qr.ts zalo-service/src/accounts.ts zalo-service/test/accounts.test.ts zalo-service/test/qr.test.ts
git commit -m "feat(zalo-service): lấy mã QR người bắn — giải mã ảnh, chỉ lưu đoạn mã, giãn nhịp, làm mới 7 ngày"
```

---

### Task 8: Service — điều phối xử lý, hỏi cấu hình, đồng bộ cuốc & nhóm, nối vào tiến trình

**Files:**
- Create: `zalo-service/src/remote-config.ts`
- Create: `zalo-service/src/processor.ts`
- Create: `zalo-service/src/sync.ts`
- Modify: `zalo-service/src/ingest.ts`, `zalo-service/src/heartbeat.ts`, `zalo-service/src/index.ts`
- Test: `zalo-service/test/remote-config.test.ts`, `zalo-service/test/processor.test.ts`, `zalo-service/test/sync.test.ts`, `zalo-service/test/ingest-phase2.test.ts`, `zalo-service/test/heartbeat-phase2.test.ts`

**Interfaces:**
- Consumes: mọi export của Task 3–7, `Sender` / `createGetter` (giai đoạn 1, Task 3), hợp đồng endpoint Task 1–2.
- Produces:
  - `interface RemoteConfig { disabledGroupIds: Set<string>; blockedSenderUids: Set<string>; aiDailyBudgetUsd: number }`; `class ConfigPoller({ get, onQrRefresh, fallbackBudgetUsd, logger })`: `current(): RemoteConfig`, `poll(): Promise<void>`.
  - `class Processor({ messages, rides, ai: AiQueue | null, qr: QrQueue, config: () => RemoteConfig, logger })`: `handleStored(messageId)`, `handleDuplicate(senderUid, content)`, `applyAi(outcome)`, `markRaw(messageId)`, `markFailed(messageId)`, `recover(now)`.
  - `class RideSync({ rides, send, batchSize?, logger, now? })`: `flush(): Promise<void>`; `class GroupsSync({ db, send, logger, now? })`: `flush(): Promise<void>`.
  - `createIngestor` nhận thêm `processor?: Processor` (tin `stored` → `handleStored`, `duplicate` → `handleDuplicate`).
  - `buildHeartbeat` nhận thêm `extra?: { outbox_backlog: number; ai_queue_size: number; ai_spent_today_usd: number; ai_budget_usd: number }` và gộp vào payload.

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/remote-config.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigPoller } from '../src/remote-config.js'
import { silentLogger } from '../src/logger.js'

test('applies Laravel config and forwards QR refresh requests', async () => {
  const refresh: string[][] = []
  const poller = new ConfigPoller({
    get: async () => ({ status: 200, body: { disabled_group_ids: ['g1'], blocked_sender_uids: ['spam'], qr_refresh_uids: ['111'], ai_daily_budget_usd: 2.5 } }),
    onQrRefresh: (uids) => refresh.push(uids), fallbackBudgetUsd: 5, logger: silentLogger,
  })
  assert.equal(poller.current().aiDailyBudgetUsd, 5)
  await poller.poll()
  assert.ok(poller.current().disabledGroupIds.has('g1'))
  assert.ok(poller.current().blockedSenderUids.has('spam'))
  assert.equal(poller.current().aiDailyBudgetUsd, 2.5)
  assert.deepEqual(refresh, [['111']])
})

test('keeps the last good config when Laravel is unreachable or answers garbage', async () => {
  let answer: { status: number; body?: unknown } = { status: 200, body: { disabled_group_ids: ['g1'], blocked_sender_uids: [], qr_refresh_uids: [], ai_daily_budget_usd: 3 } }
  const poller = new ConfigPoller({ get: async () => answer, onQrRefresh: () => {}, fallbackBudgetUsd: 5, logger: silentLogger })
  await poller.poll()
  answer = { status: 0 }
  await poller.poll()
  answer = { status: 200, body: { nonsense: true } }
  await poller.poll()
  assert.ok(poller.current().disabledGroupIds.has('g1'))
  assert.equal(poller.current().aiDailyBudgetUsd, 3)
})
```

`zalo-service/test/processor.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { SenderStore } from '../src/senders.js'
import { QrQueue } from '../src/qr.js'
import { AiQueue } from '../src/ai/queue.js'
import { AiUsage } from '../src/ai/usage.js'
import { Processor } from '../src/processor.js'
import type { RemoteConfig } from '../src/remote-config.js'
import { silentLogger } from '../src/logger.js'

const HOUR = 3_600_000
const SENT = Date.parse('2026-10-04T01:30:00Z') - 7 * HOUR

function harness(opts: { ai?: boolean; config?: Partial<RemoteConfig> } = {}) {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => SENT })
  const qr = new QrQueue({ senders: new SenderStore(db), getQr: async () => ({}), decode: async () => null, onUpdated: () => {}, refreshMs: 7 * 24 * HOUR, logger: silentLogger, now: () => SENT })
  const ai = opts.ai === false ? null : new AiQueue({
    extractor: { extract: async () => ({ outcomes: [], inputTokens: 0, outputTokens: 0 }) },
    usage: new AiUsage(db), budgetUsd: () => 5, onOutcome: () => {}, onOverBudget: () => {}, onFailed: () => {}, logger: silentLogger,
  })
  const config: RemoteConfig = { disabledGroupIds: new Set(), blockedSenderUids: new Set(), aiDailyBudgetUsd: 5, ...opts.config }
  const processor = new Processor({ messages, rides, ai, qr, config: () => config, logger: silentLogger })
  let n = 0
  const save = (content: string, overrides: Record<string, string> = {}) => {
    const item = { group_id: 'g1', group_name: '', msg_id: `m${++n}`, sender_uid: '111', sender_name: '', content, sent_at: SENT, ...overrides }
    messages.save(item, 'acc1')
    return messages.findId(item.group_id, item.msg_id)!
  }
  return { messages, rides, qr, ai, processor, save }
}

test('rule-parsed message becomes rides and the sender is queued for QR', () => {
  const h = harness()
  const id = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'ride')
  assert.equal(h.rides.backlog(), 1)
  assert.equal(h.qr.size, 1)
})

test('chatter is marked not_ride', () => {
  const h = harness()
  const id = h.save('chào cả nhà')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'not_ride')
})

test('ambiguous message waits for AI; without AI it becomes a raw ride', () => {
  const h = harness()
  const id = h.save('T1 - trần khát chân 180k freeeeeeee')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'ai_pending')
  assert.equal(h.ai!.size, 1)

  const noAi = harness({ ai: false })
  const id2 = noAi.save('T1 - trần khát chân 180k freeeeeeee')
  noAi.processor.handleStored(id2)
  assert.equal(noAi.messages.get(id2)!.parse_status, 'raw')
  assert.equal(noAi.rides.unsynced(10)[0].is_raw, true)
})

test('disabled group and blocked sender are skipped', () => {
  const h = harness({ config: { disabledGroupIds: new Set(['g2']), blockedSenderUids: new Set(['spam']) } })
  const a = h.save('tiễn 5h phố cổ', { group_id: 'g2' })
  const b = h.save('tiễn 5h phố cổ', { sender_uid: 'spam' })
  h.processor.handleStored(a)
  h.processor.handleStored(b)
  assert.equal(h.messages.get(a)!.parse_status, 'skipped_group')
  assert.equal(h.messages.get(b)!.parse_status, 'blocked')
  assert.equal(h.rides.backlog(), 0)
})

test('AI outcome is applied: rides or not_ride', () => {
  const h = harness()
  const id = h.save('tin khó')
  h.processor.applyAi({ id, isRide: false, rides: [] })
  assert.equal(h.messages.get(id)!.parse_status, 'not_ride')
})

test('recover re-queues ai_pending and unprocessed pending messages', () => {
  const h = harness()
  const pendingAi = h.save('T1 - trần khát chân 180k')
  h.messages.setStatus(pendingAi, 'ai_pending')
  const unprocessed = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.recover(SENT + 60_000)
  assert.equal(h.ai!.size, 1)
  assert.equal(h.messages.get(unprocessed)!.parse_status, 'ride')
})
```

`zalo-service/test/sync.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { GroupsSync, RideSync } from '../src/sync.js'
import { AIRPORT } from '../src/parser/rules.js'
import { silentLogger } from '../src/logger.js'

const HOUR = 3_600_000
const T0 = 1_759_500_000_000

function setup(rideCount: number) {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  let t = T0
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => t })
  messages.save({ group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: 'm1', sender_uid: '111', sender_name: 'Đức', content: 'x', sent_at: T0 }, 'acc1')
  const source = { messageId: messages.findId('g1', 'm1')!, senderUid: '111', groupId: 'g1', sentAt: T0 }
  for (let i = 0; i < rideCount; i++) {
    rides.upsertDrafts(source, [{ direction: 'to_airport', pickup: `điểm ${i}`, destination: AIRPORT, pickupAt: T0 + HOUR, pickupTimeText: '5h', seats: null, vehicleNote: null, price: null, isFree: false, rawText: 'x' }])
  }
  return { db, rides, tick: (ms: number) => { t += ms } }
}

test('sends batches of at most 100 until the outbox is empty', async () => {
  const { rides } = setup(150)
  const sizes: number[] = []
  const sync = new RideSync({ rides, send: async (_p, payload) => { sizes.push((payload as { rides: unknown[] }).rides.length); return { status: 200 } }, batchSize: 100, logger: silentLogger, now: () => T0 })
  await sync.flush()
  assert.deepEqual(sizes, [100, 50])
  assert.equal(rides.backlog(), 0)
})

test('keeps rides when Laravel fails and resends them later', async () => {
  const { rides } = setup(3)
  let status = 503
  let t = T0
  const sync = new RideSync({ rides, send: async () => ({ status }), batchSize: 100, logger: silentLogger, now: () => t })
  await sync.flush()
  assert.equal(rides.backlog(), 3)
  status = 200
  await sync.flush() // vẫn trong thời gian chờ
  assert.equal(rides.backlog(), 3)
  t += 1000
  await sync.flush()
  assert.equal(rides.backlog(), 0)
})

test('a ride updated after sync is sent again', async () => {
  const { rides, tick } = setup(1)
  const sent: string[] = []
  const sync = new RideSync({ rides, send: async (_p, payload) => { sent.push(...(payload as { rides: { ride_uid: string }[] }).rides.map((r) => r.ride_uid)); return { status: 200 } }, batchSize: 100, logger: silentLogger, now: () => T0 })
  await sync.flush()
  tick(1000)
  rides.markSenderChanged('111')
  await sync.flush()
  assert.equal(sent.length, 2)
  assert.equal(sent[0], sent[1])
})

test('groups sync sends names and 24h counts', async () => {
  const { db } = setup(0)
  let payload: unknown
  const sync = new GroupsSync({ db, send: async (_p, body) => { payload = body; return { status: 200 } }, logger: silentLogger, now: () => T0 + 1000 })
  await sync.flush()
  assert.deepEqual(payload, { groups: [{ zalo_group_id: 'g1', name: 'Taxi Nội Bài', last_message_at: T0, messages_24h: 1 }] })
})
```

`zalo-service/test/ingest-phase2.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { GroupNames } from '../src/groups.js'
import { createIngestor, newCounters } from '../src/ingest.js'
import type { Processor } from '../src/processor.js'

const HOUR = 3_600_000

test('stored messages go to the processor; duplicates bump the original', async () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const stored: number[] = []
  const dups: string[] = []
  const processor = { handleStored: (id: number) => stored.push(id), handleDuplicate: (uid: string, content: string) => dups.push(`${uid}:${content}`) } as unknown as Processor
  const ingest = createIngestor({ store, groups: new GroupNames({ fetchName: async () => '' }), counters: newCounters(), processor })
  const msg = (msgId: string, threadId: string) => ({ type: 1, isSelf: false, threadId, data: { msgId, uidFrom: '111', ts: '1730000000000', content: 'tiễn 5h phố cổ' } })

  await ingest('acc1', msg('1', 'g1'))
  await ingest('acc1', msg('2', 'g2'))
  await ingest('acc2', msg('1', 'g1'))

  assert.deepEqual(stored, [store.findId('g1', '1')])
  assert.deepEqual(dups, ['111:tiễn 5h phố cổ'])
})
```

`zalo-service/test/heartbeat-phase2.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat } from '../src/heartbeat.js'
import { newCounters } from '../src/ingest.js'

test('extra phase-2 fields are merged into the payload', () => {
  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(), accounts: [],
    extra: { outbox_backlog: 12, ai_queue_size: 3, ai_spent_today_usd: 1.5, ai_budget_usd: 5 },
  })
  assert.equal(payload.outbox_backlog, 12)
  assert.equal(payload.ai_spent_today_usd, 1.5)
  assert.equal(payload.service_id, 'zalo-1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — thiếu `remote-config.js`, `processor.js`, `sync.js`; `createIngestor` chưa gọi processor; `payload.outbox_backlog` undefined

- [ ] **Step 3: Implement remote-config, processor, sync**

`zalo-service/src/remote-config.ts`:

```ts
import type { Getter } from './http.js'
import type { Logger } from './logger.js'

export interface RemoteConfig {
  disabledGroupIds: Set<string>
  blockedSenderUids: Set<string>
  aiDailyBudgetUsd: number
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

// Hỏi cấu hình Laravel (GET /api/internal/zalo/config). Lỗi mạng / câu trả lời hỏng → giữ cấu hình cũ.
export class ConfigPoller {
  private config: RemoteConfig

  constructor(
    private readonly deps: {
      get: Getter
      onQrRefresh: (uids: string[]) => void
      fallbackBudgetUsd: number
      logger: Logger
    },
  ) {
    this.config = { disabledGroupIds: new Set(), blockedSenderUids: new Set(), aiDailyBudgetUsd: deps.fallbackBudgetUsd }
  }

  current(): RemoteConfig {
    return this.config
  }

  async poll(): Promise<void> {
    const res = await this.deps.get('/api/internal/zalo/config')
    if (res.status !== 200) {
      this.deps.logger.error('Hỏi cấu hình Laravel lỗi HTTP', res.status || 'mạng')
      return
    }
    const body = res.body as Record<string, unknown> | undefined
    if (!body || !isStringArray(body.disabled_group_ids) || !isStringArray(body.blocked_sender_uids)
      || !isStringArray(body.qr_refresh_uids) || typeof body.ai_daily_budget_usd !== 'number') {
      this.deps.logger.error('Cấu hình Laravel sai định dạng, giữ cấu hình cũ')
      return
    }
    this.config = {
      disabledGroupIds: new Set(body.disabled_group_ids),
      blockedSenderUids: new Set(body.blocked_sender_uids),
      aiDailyBudgetUsd: body.ai_daily_budget_usd,
    }
    if (body.qr_refresh_uids.length > 0) this.deps.onQrRefresh(body.qr_refresh_uids)
  }
}
```

`zalo-service/src/processor.ts`:

```ts
import type { AiOutcome, AiQueue } from './ai/queue.js'
import type { Logger } from './logger.js'
import { parseRides } from './parser/rules.js'
import type { QrQueue } from './qr.js'
import type { RemoteConfig } from './remote-config.js'
import type { RideSource, RideStore } from './rides.js'
import type { MessageStore, StoredMessage } from './store.js'
import { contentHash } from './text.js'

const DAY = 24 * 3_600_000

// Điều phối xử lý MỘT tin đã lưu (sơ đồ 6.2): nhóm tắt / người bắn bị chặn → quy tắc → AI hoặc nguyên văn.
export class Processor {
  constructor(
    private readonly deps: {
      messages: MessageStore
      rides: RideStore
      ai: AiQueue | null
      qr: QrQueue
      config: () => RemoteConfig
      logger: Logger
    },
  ) {}

  handleStored(messageId: number): void {
    const msg = this.deps.messages.get(messageId)
    if (!msg) return
    const config = this.deps.config()

    if (config.disabledGroupIds.has(msg.zalo_group_id)) return this.deps.messages.setStatus(msg.id, 'skipped_group')
    if (config.blockedSenderUids.has(msg.sender_uid)) return this.deps.messages.setStatus(msg.id, 'blocked')

    const outcome = parseRides(msg.content, msg.sent_at)
    if (outcome.kind === 'not_ride') return this.deps.messages.setStatus(msg.id, 'not_ride')
    if (outcome.kind === 'rides') {
      this.deps.rides.upsertDrafts(this.source(msg), outcome.rides)
      this.deps.messages.setStatus(msg.id, 'ride')
      this.deps.qr.ensure(msg.sender_uid)
      return
    }

    if (this.deps.ai) {
      this.deps.messages.setStatus(msg.id, 'ai_pending')
      this.deps.ai.enqueue({ id: msg.id, content: msg.content, sentAt: msg.sent_at })
    } else {
      this.markRaw(msg.id)
    }
  }

  handleDuplicate(senderUid: string, content: string): void {
    this.deps.rides.bumpForDuplicate(senderUid, contentHash(senderUid, content))
  }

  applyAi(outcome: AiOutcome): void {
    const msg = this.deps.messages.get(outcome.id)
    if (!msg) return
    if (!outcome.isRide) return this.deps.messages.setStatus(msg.id, 'not_ride')
    this.deps.rides.upsertDrafts(this.source(msg), outcome.rides)
    this.deps.messages.setStatus(msg.id, 'ride')
    this.deps.qr.ensure(msg.sender_uid)
  }

  // Hết ngân sách AI: vẫn hiển thị nguyên văn để tab Free không mất cuốc.
  markRaw(messageId: number): void {
    const msg = this.deps.messages.get(messageId)
    if (!msg) return
    this.deps.rides.addRaw(this.source(msg), msg.content)
    this.deps.messages.setStatus(msg.id, 'raw')
    this.deps.qr.ensure(msg.sender_uid)
  }

  markFailed(messageId: number): void {
    this.deps.messages.setStatus(messageId, 'failed')
  }

  // Khởi động lại: tin đang chờ AI bị mất khỏi hàng đợi trong RAM; tin pending có thể chưa kịp xử lý.
  recover(now: number): void {
    const since = now - DAY
    for (const id of this.deps.messages.idsByStatus('ai_pending', since)) {
      const msg = this.deps.messages.get(id)
      if (msg && this.deps.ai) this.deps.ai.enqueue({ id, content: msg.content, sentAt: msg.sent_at })
      else if (msg) this.markRaw(id)
    }
    for (const id of this.deps.messages.idsByStatus('pending', since)) this.handleStored(id)
    this.deps.logger.info('Đã xếp lại tin dở dang sau khi khởi động')
  }

  private source(msg: StoredMessage): RideSource {
    return { messageId: msg.id, senderUid: msg.sender_uid, groupId: msg.zalo_group_id, sentAt: msg.sent_at }
  }
}
```

`zalo-service/src/sync.ts`:

```ts
import type { Db } from './db.js'
import type { Sender } from './http.js'
import type { Logger } from './logger.js'
import type { RideStore } from './rides.js'

/**
 * Hộp thư đi → Laravel: gửi tuần tự từng lô ≤ batchSize tới khi hết; Laravel lỗi thì giữ nguyên và chờ lùi dần
 * (1s → 60s). index.ts gọi flush() mỗi ridesFlushMs (2 giây).
 */
export class RideSync {
  private running = false
  private retryAt = 0
  private backoffMs = 0

  constructor(private readonly deps: { rides: RideStore; send: Sender; batchSize?: number; logger: Logger; now?: () => number }) {}

  async flush(): Promise<void> {
    const now = (this.deps.now ?? Date.now)()
    if (this.running || now < this.retryAt) return
    this.running = true
    try {
      for (;;) {
        const at = (this.deps.now ?? Date.now)()
        const batch = this.deps.rides.unsynced(this.deps.batchSize ?? 100)
        if (batch.length === 0) return
        const { status } = await this.deps.send('/api/internal/zalo/rides', { rides: batch })
        if (status !== 200) {
          this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 60_000)
          this.retryAt = now + this.backoffMs
          this.deps.logger.error(`Gửi ${batch.length} cuốc sang Laravel lỗi HTTP ${status || 'mạng'} — thử lại sau ${this.backoffMs}ms`)
          return
        }
        this.deps.rides.markSynced(batch.map((r) => r.ride_uid), at)
        this.backoffMs = 0
        this.retryAt = 0
      }
    } finally {
      this.running = false
    }
  }
}

// Danh sách nhóm + số tin 24 giờ cho trang admin (mỗi 10 phút).
export class GroupsSync {
  constructor(private readonly deps: { db: Db; send: Sender; logger: Logger; now?: () => number }) {}

  async flush(): Promise<void> {
    const since = (this.deps.now ?? Date.now)() - 24 * 3_600_000
    const groups = this.deps.db.prepare(`
      SELECT g.zalo_group_id, g.name, g.last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.zalo_group_id = g.zalo_group_id AND m.sent_at >= ?) AS messages_24h
      FROM chat_groups g ORDER BY g.zalo_group_id`).all(since)
    const { status } = await this.deps.send('/api/internal/zalo/groups', { groups })
    if (status !== 200) this.deps.logger.error('Đồng bộ danh sách nhóm lỗi HTTP', status || 'mạng')
  }
}
```

`zalo-service/src/ingest.ts` — thêm `import type { Processor } from './processor.js'`, thêm `processor?: Processor` vào tham số `deps` của `createIngestor`, và ngay sau dòng `const saved = deps.store.save(item, accountId, now())` thêm:

```ts
    if (deps.processor) {
      if (saved === 'stored') {
        const id = deps.store.findId(groupId, item.msg_id)
        if (id !== undefined) deps.processor.handleStored(id)
      } else if (saved === 'duplicate') {
        deps.processor.handleDuplicate(item.sender_uid, item.content)
      }
    }
```

`zalo-service/src/heartbeat.ts` — thêm tham số `extra?: { outbox_backlog: number; ai_queue_size: number; ai_spent_today_usd: number; ai_budget_usd: number }` vào `input` và cuối object trả về thêm `...(input.extra ?? {})`.

`zalo-service/src/index.ts` — nối giai đoạn 2. Thêm import:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { RideStore } from './rides.js'
import { SenderStore } from './senders.js'
import { QrQueue, decodeQrFromUrl } from './qr.js'
import { AiUsage } from './ai/usage.js'
import { AiQueue } from './ai/queue.js'
import { AnthropicExtractor } from './ai/extractor.js'
import { ConfigPoller } from './remote-config.js'
import { Processor } from './processor.js'
import { GroupsSync, RideSync } from './sync.js'
import { createGetter } from './http.js'
```

Thay khối từ `const ingest = createIngestor(...)` tới hết `await manager.startAll()` bằng:

```ts
const send = createSender({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const get = createGetter({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const rides = new RideStore(db, { expireAfterPickupMs: cfg.rideExpireAfterPickupMs, expireWithoutTimeMs: cfg.rideExpireWithoutTimeMs })
const usage = new AiUsage(db)

// processor được gán ngay bên dưới; các callback chỉ chạy khi đã có tin.
let processor: Processor | undefined
const qr = new QrQueue({
  senders: new SenderStore(db),
  getQr: async (uid) => {
    const api = manager?.anyApi()
    if (!api) throw new Error('Chưa có tài khoản nào đăng nhập')
    return api.getQR(uid)
  },
  decode: decodeQrFromUrl,
  onUpdated: (uid) => rides.markSenderChanged(uid),
  refreshMs: cfg.qrRefreshDays * 24 * HOUR,
  logger,
})
const remote = new ConfigPoller({ get, onQrRefresh: (uids) => uids.forEach((uid) => qr.force(uid)), fallbackBudgetUsd: cfg.aiDailyBudgetUsd, logger })
const ai = cfg.aiEnabled
  ? new AiQueue({
      extractor: new AnthropicExtractor(new Anthropic(), cfg.aiModel),
      usage,
      budgetUsd: () => remote.current().aiDailyBudgetUsd,
      onOutcome: (outcome) => processor?.applyAi(outcome),
      onOverBudget: (id) => processor?.markRaw(id),
      onFailed: (id) => processor?.markFailed(id),
      batchSize: cfg.aiBatchSize,
      logger,
    })
  : null
if (!ai) logger.info('Chưa có ANTHROPIC_API_KEY — tin khó sẽ hiển thị nguyên văn')
processor = new Processor({ messages: store, rides, ai, qr, config: () => remote.current(), logger })

const ingest = createIngestor({ store, groups, counters, processor })

manager = new AccountManager({
  accounts,
  login: async (credentials) => {
    const api = await new Zalo({ selfListen: false, logging: false }).login(credentials as Credentials)
    return api as unknown as ApiLike
  },
  onMessage: (accountId, message) => {
    ingest(accountId, message as IncomingMessage).catch((err) => logger.error('Lỗi xử lý tin:', err))
  },
  logger,
  retryMs: cfg.accountRetryMs,
})

await remote.poll()
processor.recover(Date.now())
await manager.startAll()

const rideSync = new RideSync({ rides, send, batchSize: cfg.ridesBatchSize, logger })
const groupsSync = new GroupsSync({ db, send, logger })
const every = (ms: number, fn: () => Promise<void> | void) =>
  setInterval(() => { Promise.resolve().then(fn).catch((err) => logger.error('Lỗi tác vụ định kỳ:', err)) }, ms)

every(cfg.ridesFlushMs, () => rideSync.flush())
every(cfg.aiFlushMs, () => ai?.flush())
every(cfg.qrIntervalMs, () => qr.step())
every(cfg.configPollMs, () => remote.poll())
every(cfg.groupsSyncMs, () => groupsSync.flush())
```

Trong `setInterval` của heartbeat, truyền thêm:

```ts
    extra: { outbox_backlog: rides.backlog(), ai_queue_size: ai?.size ?? 0, ai_spent_today_usd: usage.spentToday(), ai_budget_usd: remote.current().aiDailyBudgetUsd },
```

và xoá dòng `const send = createSender(...)` cũ phía dưới (đã khai báo ở trên). Trong `setInterval` dọn tin mỗi giờ, thêm `rides.prune()`.

- [ ] **Step 4: Run tests, typecheck, build**

Run: `cd zalo-service && npm test && npm run typecheck && npm run build`
Expected: PASS (`# fail 0`), typecheck sạch, build tạo `dist/src/index.js`

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/remote-config.ts zalo-service/src/processor.ts zalo-service/src/sync.ts zalo-service/src/ingest.ts zalo-service/src/heartbeat.ts zalo-service/src/index.ts zalo-service/test/remote-config.test.ts zalo-service/test/processor.test.ts zalo-service/test/sync.test.ts zalo-service/test/ingest-phase2.test.ts zalo-service/test/heartbeat-phase2.test.ts
git commit -m "feat(zalo-service): điều phối xử lý tin, hỏi cấu hình Laravel, đồng bộ cuốc (lô 100/2s) và nhóm, xếp lại tin dở dang"
```

---

### Task 9: Triển khai & kiểm chứng với dữ liệu thật

**Files:**
- Modify: `zalo-service/.env.example`, `zalo-service/README.md`, `docs/DEPLOY.md`
- Create: `zalo-service/scripts/try-ai.ts`

**Interfaces:**
- Consumes: `AnthropicExtractor` (Task 6), `parseRides` (Task 4).

- [ ] **Step 1: Write the AI trial script**

`zalo-service/scripts/try-ai.ts`:

```ts
// Kiểm chứng AI với vài tin mẫu (cần ANTHROPIC_API_KEY): npm run try-ai
// In kết quả quy tắc + AI cạnh nhau để chỉnh prompt / quy tắc trước khi bật thật.
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicExtractor } from '../src/ai/extractor.js'
import { parseRides } from '../src/parser/rules.js'

const samples = [
  '5h tran nhan tong 200k free CK pl',
  "8h30' tiễn 89 Quan Nhân về Đại Tảo Đa Phúc SS 2c đổ đón tầm 12h30' hẹn khách đón về lại tk600k sdb vf6",
  '0-30p bx vf8 hoặc limo yên vỹ yên phong bn đi kcn quang minh 250k',
  'T1 - trần khát chân 180k freeeeeeee',
  'chào cả nhà',
]
const now = Date.now()
const extractor = new AnthropicExtractor(new Anthropic(), process.env.AI_MODEL || 'claude-haiku-4-5')
const { outcomes, inputTokens, outputTokens } = await extractor.extract(samples.map((content, id) => ({ id, content, sentAt: now })))

for (const [i, content] of samples.entries()) {
  console.log('\n──', content)
  console.log('quy tắc:', parseRides(content, now).kind)
  console.log('AI:', JSON.stringify(outcomes[i], null, 1))
}
console.log(`\ntoken vào ${inputTokens}, ra ${outputTokens} ≈ $${(inputTokens / 1e6 + (outputTokens * 5) / 1e6).toFixed(5)}`)
```

Thêm vào `scripts` của `zalo-service/package.json`: `"try-ai": "tsx scripts/try-ai.ts"`.

- [ ] **Step 2: Update env example, README, DEPLOY**

`zalo-service/.env.example` — thêm:

```
# Giai đoạn 2 — AI tách cuốc (bỏ trống = tin khó hiển thị nguyên văn)
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-4-5
# Trần mặc định nếu chưa hỏi được Laravel (Laravel: ZALO_AI_DAILY_BUDGET_USD)
AI_DAILY_BUDGET_USD=5
```

`zalo-service/README.md` — thêm mục:

````markdown
## Giai đoạn 2 — tách cuốc, AI, mã QR, đồng bộ

- Tin `pending` → quy tắc → cuốc / không phải cuốc / chờ AI. Cuốc nằm ở bảng `rides` (hộp thư đi), gửi Laravel từng lô ≤ 100 cuốc mỗi 2 giây.
- AI chỉ chạy khi có `ANTHROPIC_API_KEY`; trần ngân sách theo ngày giờ VN lấy từ Laravel (`ZALO_AI_DAILY_BUDGET_USD`). Hết ngân sách → cuốc nguyên văn.
- Thử AI với tin mẫu: `ANTHROPIC_API_KEY=... npm run try-ai`.
- Xem trạng thái tin: `sqlite3 data/zalo.sqlite "select parse_status, count(*) from messages group by 1"`.
- Xem hộp thư đi: `sqlite3 data/zalo.sqlite "select count(*) from rides where synced_at is null or updated_at > synced_at"`.
````

`docs/DEPLOY.md` — trong mục "Microservice Zalo — Cuốc Free", thêm:

````markdown
### Giai đoạn 2

- Laravel: `php artisan migrate --force` (4 bảng `free_rides`, `zalo_groups`, `zalo_sender_blocks`, `zalo_qr_refresh_requests`);
  `.env` thêm `ZALO_AI_DAILY_BUDGET_USD=5` (theo mức GreenCA duyệt) rồi `php artisan config:cache`.
- Service: `.env` thêm `ANTHROPIC_API_KEY` (key do AMD quản lý, tính vào phí AI hàng tháng), `npm ci && npm run build`,
  `systemctl restart greenca-zalo-service`. DB SQLite tự nâng lên schema v2 khi khởi động.
- `zalo:service-status` báo thêm khi hộp thư đi tồn > 1000 cuốc.
````

- [ ] **Step 3: Verify end to end on the dev machine**

```bash
# Laravel local
docker compose exec -T app php artisan migrate
# Service: chạy như giai đoạn 1, thêm ANTHROPIC_API_KEY nếu có
cd zalo-service && npm run build
ANTHROPIC_API_KEY=... npm run try-ai                    # nếu có key
API_BASE_URL=http://localhost:8080 BOT_SECRET=dev-secret SERVICE_ID=zalo-dev npm run dev
```

Expected:
- `try-ai`: mỗi tin mẫu có kết quả AI hợp lý (tin chào hỏi `isRide: false`), chi phí in ra cỡ $0.001.
- Khi nhóm có tin: `sqlite3 data/zalo.sqlite "select parse_status, count(*) from messages group by 1"` có `ride` / `not_ride` (và `ai_pending` → `ride` sau vài giây nếu có key).
- `docker compose exec -T app php artisan tinker --execute="echo App\Models\FreeRide::count();"` tăng dần; `select qr_code ...` có mã cho người bắn mới sau vài giây.
- Nhắn bằng nick chính `tiễn 5h phố cổ 200k` vào nhóm → trong ≤ 5 giây có một dòng `free_rides` với `pickup = 'phố cổ'`.

- [ ] **Step 4: Commit**

```bash
git add zalo-service/scripts/try-ai.ts zalo-service/package.json zalo-service/.env.example zalo-service/README.md docs/DEPLOY.md
git commit -m "docs(zalo-service): triển khai giai đoạn 2 + script thử AI với tin mẫu"
```
