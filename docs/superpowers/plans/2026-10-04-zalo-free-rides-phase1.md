# Cuốc Free từ nhóm Zalo — Giai đoạn 1: Service Node thu tin thô — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Microservice Node (`zalo-service/`) chạy trên VPS riêng, nghe tin mới từ các nhóm Zalo bằng N tài khoản phụ, **lưu ngay** tin thô vào SQLite (bỏ tin trùng), tự dọn sau 7 ngày, có lệnh thống kê và gửi heartbeat; Laravel chỉ nhận heartbeat để giám sát + cảnh báo Telegram. Mục đích: thu dữ liệu thật để chốt chi phí AI và viết quy tắc tách cuốc ở giai đoạn 2.

**Architecture:** Hướng C trong spec — Node làm toàn bộ phần nặng, Laravel làm việc nhẹ nhất. Một tiến trình TypeScript quản lý N phiên `zca-js`; mỗi tin chữ trong nhóm được ghi đồng bộ vào SQLite (WAL) trong một transaction: idempotent theo `(nhóm, msg_id)` (hai tài khoản cùng nghe một tin chỉ lưu một lần), đánh dấu `duplicate` khi cùng người gửi đăng cùng nội dung đã chuẩn hoá trong 24 giờ. Mọi kết nối do Node khởi tạo: heartbeat ký HMAC gửi `POST /api/internal/zalo/heartbeat` mỗi 60 giây; Laravel lưu vào cache, lệnh `zalo:service-status` trả exit code cho script giám sát sẵn có. Giai đoạn này **không gọi AI**.

**Tech Stack:** Node 20, TypeScript (chạy bằng `tsx` khi dev/test, build bằng `tsc`), `better-sqlite3`, `zca-js` 2.2.0, `node:test`; Laravel 13 / PHP 8.4+ (production chạy PHP 8.5), Redis cache, systemd.

**Spec:** `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md` — đọc mục 2 (năm nguyên tắc), 4.3 (hợp đồng Node ↔ Laravel) và sơ đồ 6.2 (xử lý một tin), 6.4 (vòng đời service), 6.5 (giám sát) trước khi làm.

## Global Constraints

- Hướng C: Node làm mọi phần nặng; **Laravel không bao giờ gọi vào service** (VPS service không mở cổng nào).
- Chữ ký: header `X-Zalo-Timestamp` (unix giây) + `X-Zalo-Signature` = hex `HMAC-SHA256(ZALO_BOT_SECRET, "{timestamp}.{raw body}")`. Lệch giờ > 300 giây → 401. Secret rỗng → 401 mọi request.
- Công tắc Laravel `ZALO_SERVICE_ENABLED` (mặc định `false`): tắt thì endpoint trả 503.
- Lưu ngay khi nhận: tin được ghi SQLite trước mọi xử lý khác.
- Idempotent theo `(zalo_group_id, zalo_msg_id)`.
- Bỏ trùng: cùng `sender_uid` + nội dung đã chuẩn hoá, `sent_at` cách nhau ≤ 24 giờ → `parse_status = duplicate`.
- Tin thô tự xoá sau **7 ngày**; nội dung cắt ở 4.000 ký tự, tên nhóm/người gửi cắt ở 255 ký tự (cắt, không từ chối).
- Một tiến trình quản lý N tài khoản; một tài khoản lỗi **không** làm dừng tài khoản khác, tự đăng nhập lại sau 60 giây.
- Heartbeat 60 giây; cảnh báo khi heartbeat > 180 giây, có tài khoản mất kết nối, hoặc 10 phút không có tin trong khung 5h–23h.
- Service **chỉ đọc**: không bao giờ gọi `sendMessage`, `sendFriendRequest` hay API ghi nào của Zalo.
- Quyết định 1.2: một cuốc = một tin; không ghép nhiều tin.
- Giai đoạn 1 **không gọi Claude/AI**.
- `zca-js` ghim đúng `2.2.0`; Node ≥ 20; TypeScript `strict`.
- Theo quy ước repo: controller Laravel trả mảng thuần; comment, log, thông báo bằng tiếng Việt.

## Review Focus

1. **Hai tài khoản phụ cùng ở một nhóm nghe cùng một tin** → chỉ lưu một dòng (`ignored` cho lần sau). Test: `same message heard by two accounts is stored once` (Task 4) và `a second account hearing the same message counts as ignored` (Task 5).
2. **Một tài khoản bị khoá / phiên hết hạn** → các tài khoản khác vẫn chạy, tài khoản lỗi tự thử lại. Test: `a failing account does not stop the others and is retried` (Task 6).
3. **Tin dán cực dài / tên nhóm cực dài** → cắt bớt rồi lưu, không từ chối. Test: `long content and names are truncated, not rejected` (Task 4).
4. **Người bắn đăng lại cùng cuốc sau hơn 24 giờ, hoặc sửa xuống dòng/hoa thường trong 24 giờ** → lần sau 24 giờ là tin mới, lần sửa định dạng trong 24 giờ là trùng. Test: `repost after the window is not duplicate` và `reformatted repost in another group within 24h is duplicate` (Task 4).
5. **Ban đêm nhóm vắng** → không cảnh báo "im lặng" ngoài khung 5h–23h. Test: `test_silence_outside_active_hours_is_not_an_alert` (Task 2).

## Ngoài phạm vi giai đoạn 1 (các kế hoạch sau)

Tách cuốc theo quy tắc + AI, `getQR`, hộp thư đi, endpoint `rides` / `groups` / `config` (giai đoạn 2); tab Free, tín hiệu realtime, báo cáo/ẩn (giai đoạn 3); trang admin, kiểm thử tải (giai đoạn 4). Điều tra ở giai đoạn 2: `listener.requestOldMessages()` có bù được tin lỡ không.

## File Structure

**Laravel (`backend/`)**

| File | Trách nhiệm |
| --- | --- |
| `config/zalo.php` | Công tắc, secret, ngưỡng giám sát |
| `app/Http/Middleware/VerifyZaloBotSignature.php` | Công tắc + kiểm chữ ký HMAC |
| `app/Services/Zalo/ZaloServiceMonitor.php` | Ghi heartbeat, đánh giá tình trạng service |
| `app/Http/Controllers/Webhooks/ZaloServiceController.php` | Endpoint `heartbeat` (giai đoạn 2 thêm `rides`, `groups`, `config`) |
| `app/Console/Commands/ZaloServiceStatus.php` | `zalo:service-status` (exit code cho giám sát) |
| `routes/api.php`, `bootstrap/app.php` | Route, alias middleware |
| `tests/Concerns/SignsZaloBotRequests.php` | Helper ký request trong test |
| `tests/Feature/ZaloBotSignatureTest.php`, `tests/Feature/ZaloServiceStatusTest.php` | Test |

**Service (`zalo-service/`, thư mục mới ở gốc repo)**

| File | Trách nhiệm |
| --- | --- |
| `package.json`, `tsconfig.json`, `.gitignore`, `.env.example` | Khung dự án |
| `src/logger.ts` | Log có giờ |
| `src/config.ts` | Đọc biến môi trường |
| `src/sign.ts`, `src/http.ts` | Ký HMAC (khớp Laravel), gửi POST trả `{status}` |
| `src/text.ts` | Chuẩn hoá nội dung, băm chống trùng, nhận diện "có giờ" |
| `src/db.ts` | Mở SQLite (WAL) + tạo bảng |
| `src/store.ts` | Lưu một tin (idempotent, đánh dấu trùng, cắt độ dài), dọn tin cũ |
| `src/stats.ts`, `src/cli/stats.ts` | Thống kê để chốt chi phí AI |
| `src/normalize.ts` | Tin zca-js → `MessageItem` / lý do bỏ qua |
| `src/groups.ts` | Cache tên nhóm |
| `src/ingest.ts` | Xử lý một tin: chuẩn hoá → tên nhóm → lưu → bộ đếm |
| `src/heartbeat.ts` | Dựng payload heartbeat |
| `src/accounts.ts` | Quản lý N tài khoản: đăng nhập, listener, tự đăng nhập lại |
| `src/index.ts` | Ghép tất cả + hẹn giờ heartbeat/dọn tin |
| `scripts/login.ts` | Đăng nhập lần đầu bằng QR trên máy cá nhân |
| `deploy/greenca-zalo-service.service`, `README.md` | Triển khai |
| `test/*.test.ts` | Test |

**Vận hành:** `deploy/monitoring/greenca-healthcheck.sh` (thêm kiểm tra #5), `docs/DEPLOY.md` (mục mới).

---

### Task 1: Laravel — cấu hình + middleware kiểm chữ ký HMAC

**Files:**
- Create: `backend/config/zalo.php`
- Create: `backend/app/Http/Middleware/VerifyZaloBotSignature.php`
- Modify: `backend/bootstrap/app.php` (khối `$middleware->alias([...])`)
- Create: `backend/tests/Concerns/SignsZaloBotRequests.php`
- Test: `backend/tests/Feature/ZaloBotSignatureTest.php`

**Interfaces:**
- Produces: `config('zalo.enabled' | 'bot_secret' | 'max_clock_skew_seconds' | 'heartbeat_stale_seconds' | 'silence_alert_minutes' | 'active_hours')`.
- Produces: middleware alias `zalo.bot`; trait `Tests\Concerns\SignsZaloBotRequests::zaloPost(string $uri, array $payload, ?int $timestamp = null, ?string $secret = null): TestResponse`.
- Produces (hợp đồng với service, Task 3 dùng cùng vector): secret `test-secret`, timestamp `1700000000`, body `{"bot_id":"bot-1","messages":[{"content":"4h30 Tiễn Hoài Đức"}]}` → chữ ký `1b79231e73c3fcd9383c96d959e1b1fcd6376675df5231d2ea3e66e943aeb4b7`.

- [ ] **Step 1: Write the test helper and failing tests**

`backend/tests/Concerns/SignsZaloBotRequests.php`:

```php
<?php

namespace Tests\Concerns;

use Illuminate\Testing\TestResponse;

trait SignsZaloBotRequests
{
    // Ký đúng như service Node: HMAC-SHA256(secret, "{timestamp}.{raw body}").
    protected function zaloPost(string $uri, array $payload, ?int $timestamp = null, ?string $secret = null): TestResponse
    {
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $ts = (string) ($timestamp ?? now()->timestamp);
        $signature = hash_hmac('sha256', $ts.'.'.$body, $secret ?? (string) config('zalo.bot_secret'));

        return $this->call('POST', $uri, [], [], [], [
            'CONTENT_TYPE'          => 'application/json',
            'HTTP_ACCEPT'           => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => $ts,
            'HTTP_X_ZALO_SIGNATURE' => $signature,
        ], $body);
    }
}
```

`backend/tests/Feature/ZaloBotSignatureTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloBotSignatureTest extends TestCase
{
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        Route::post('/api/_test/zalo', fn () => ['ok' => true])->middleware('zalo.bot');
    }

    public function test_valid_signature_passes(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'])->assertOk()->assertJson(['ok' => true]);
    }

    public function test_known_vector_shared_with_node_service_passes(): void
    {
        $this->travelTo(Carbon::createFromTimestamp(1700000000));
        $body = '{"bot_id":"bot-1","messages":[{"content":"4h30 Tiễn Hoài Đức"}]}';

        $this->call('POST', '/api/_test/zalo', [], [], [], [
            'CONTENT_TYPE'          => 'application/json',
            'HTTP_ACCEPT'           => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => '1700000000',
            'HTTP_X_ZALO_SIGNATURE' => '1b79231e73c3fcd9383c96d959e1b1fcd6376675df5231d2ea3e66e943aeb4b7',
        ], $body)->assertOk();
    }

    public function test_wrong_secret_is_rejected(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], secret: 'other')->assertStatus(401);
    }

    public function test_tampered_body_is_rejected(): void
    {
        $ts = (string) now()->timestamp;
        $sig = hash_hmac('sha256', $ts.'.{"bot_id":"bot-1"}', 'test-secret');

        $this->call('POST', '/api/_test/zalo', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_ZALO_TIMESTAMP' => $ts, 'HTTP_X_ZALO_SIGNATURE' => $sig,
        ], '{"bot_id":"bot-2"}')->assertStatus(401);
    }

    public function test_stale_timestamp_is_rejected(): void
    {
        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], timestamp: now()->timestamp - 301)->assertStatus(401);
    }

    public function test_empty_secret_rejects_everything(): void
    {
        config(['zalo.bot_secret' => '']);

        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'], secret: '')->assertStatus(401);
    }

    public function test_kill_switch_returns_503(): void
    {
        config(['zalo.enabled' => false]);

        $this->zaloPost('/api/_test/zalo', ['bot_id' => 'bot-1'])->assertStatus(503);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=ZaloBotSignatureTest`
Expected: FAIL — `Target class [zalo.bot] does not exist.`

- [ ] **Step 3: Implement config, middleware, alias**

`backend/config/zalo.php`:

```php
<?php

// Microservice Zalo (Cuốc Free) — Laravel chỉ làm phần nhẹ: nhận dữ liệu đã xử lý từ
// service Node + giám sát. Spec: docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md
return [
    // Công tắc tắt nhanh mọi endpoint /api/internal/zalo/* (trả 503) mà không cần deploy.
    'enabled' => (bool) env('ZALO_SERVICE_ENABLED', false),

    // Khoá HMAC dùng chung với service. Rỗng = từ chối mọi request.
    'bot_secret' => env('ZALO_BOT_SECRET', ''),

    'max_clock_skew_seconds' => 300,

    // Giám sát (zalo:service-status)
    'heartbeat_stale_seconds' => 180,
    'silence_alert_minutes'   => 10,
    // Ngoài khung giờ này nhóm vắng là bình thường — không cảnh báo im lặng.
    'active_hours' => [5, 23],
];
```

`backend/app/Http/Middleware/VerifyZaloBotSignature.php`:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Xác thực request từ service Zalo (không dùng Sanctum — service không phải người dùng).
 *
 * Chữ ký = hex HMAC-SHA256(ZALO_BOT_SECRET, "{X-Zalo-Timestamp}.{raw body}").
 * Ký trên body THÔ (getContent) chứ không phải mảng đã parse, để PHP và Node
 * không lệch nhau vì cách encode JSON (unicode, thứ tự khoá...).
 */
class VerifyZaloBotSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('zalo.enabled')) {
            return response()->json(['message' => 'Đã tắt kết nối service Zalo'], 503);
        }

        $secret = (string) config('zalo.bot_secret', '');
        $timestamp = (string) $request->header('X-Zalo-Timestamp', '');
        $signature = (string) $request->header('X-Zalo-Signature', '');

        if ($secret === '' || $signature === '' || ! ctype_digit($timestamp)) {
            return response()->json(['message' => 'Sai chữ ký'], 401);
        }

        if (abs(now()->timestamp - (int) $timestamp) > (int) config('zalo.max_clock_skew_seconds')) {
            return response()->json(['message' => 'Lệch giờ quá lớn — kiểm tra NTP trên VPS service'], 401);
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$request->getContent(), $secret);
        if (! hash_equals($expected, $signature)) {
            return response()->json(['message' => 'Sai chữ ký'], 401);
        }

        return $next($request);
    }
}
```

`backend/bootstrap/app.php` — thêm `use App\Http\Middleware\VerifyZaloBotSignature;` cạnh import `EnsureRole`, rồi sửa khối alias:

```php
        $middleware->alias([
            'role'     => EnsureRole::class,
            'zalo.bot' => VerifyZaloBotSignature::class,
        ]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T app php artisan test --filter=ZaloBotSignatureTest`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/config/zalo.php backend/app/Http/Middleware/VerifyZaloBotSignature.php backend/bootstrap/app.php backend/tests/Concerns/SignsZaloBotRequests.php backend/tests/Feature/ZaloBotSignatureTest.php
git commit -m "feat(zalo): middleware xác thực service Zalo bằng chữ ký HMAC + công tắc tắt"
```

---

### Task 2: Laravel — heartbeat + `zalo:service-status` + cảnh báo Telegram

**Files:**
- Create: `backend/app/Services/Zalo/ZaloServiceMonitor.php`
- Create: `backend/app/Http/Controllers/Webhooks/ZaloServiceController.php`
- Modify: `backend/routes/api.php` (thêm nhóm route ngay sau dòng `Route::post('/webhooks/sepay', ...)`)
- Create: `backend/app/Console/Commands/ZaloServiceStatus.php`
- Modify: `deploy/monitoring/greenca-healthcheck.sh` (chèn kiểm tra #5 trước dòng `# ── So với lần trước, chỉ báo khi ĐỔI trạng thái`)
- Test: `backend/tests/Feature/ZaloServiceStatusTest.php`

**Interfaces:**
- Consumes: middleware `zalo.bot`, trait `SignsZaloBotRequests`, config (Task 1).
- Produces: `POST /api/internal/zalo/heartbeat` nhận `{"service_id": string, "uptime_s": int, "accounts": [{"id": string, "connected": bool}], "received_total": int, "stored_total": int, "duplicates_total": int, "skipped_non_text": int, "last_message_at": int|null (ms)}` → `{"ok": true}`. Task 5 dựng đúng payload này.
- Produces: `ZaloServiceMonitor::recordHeartbeat(array $data): void`, `ZaloServiceMonitor::status(): array{status:int, lines:list<string>}`.
- Produces: lệnh `zalo:service-status` — exit `0` ổn, `1` có vấn đề, `2` chưa service nào từng gửi heartbeat.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/ZaloServiceStatusTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Carbon;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class ZaloServiceStatusTest extends TestCase
{
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-05 10:00:00'));
    }

    private function heartbeat(array $overrides = []): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', array_merge([
            'service_id'       => 'zalo-1',
            'uptime_s'         => 120,
            'accounts'         => [['id' => 'acc1', 'connected' => true], ['id' => 'acc2', 'connected' => true]],
            'received_total'   => 10,
            'stored_total'     => 9,
            'duplicates_total' => 3,
            'skipped_non_text' => 1,
            'last_message_at'  => now()->subMinute()->getTimestampMs(),
        ], $overrides))->assertOk()->assertJson(['ok' => true]);
    }

    public function test_no_service_ever_reported_exits_2(): void
    {
        $this->artisan('zalo:service-status')->assertExitCode(2);
    }

    public function test_fresh_heartbeat_with_recent_messages_exits_0(): void
    {
        $this->heartbeat();

        $this->artisan('zalo:service-status')->expectsOutputToContain('zalo-1: OK (2 tài khoản')->assertExitCode(0);
    }

    public function test_stale_heartbeat_exits_1(): void
    {
        $this->heartbeat();
        $this->travel(4)->minutes();

        $this->artisan('zalo:service-status')->expectsOutputToContain('mất heartbeat')->assertExitCode(1);
    }

    public function test_disconnected_account_exits_1_and_names_it(): void
    {
        $this->heartbeat(['accounts' => [['id' => 'acc1', 'connected' => true], ['id' => 'acc2', 'connected' => false]]]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('mất kết nối: acc2')->assertExitCode(1);
    }

    public function test_no_accounts_exits_1(): void
    {
        $this->heartbeat(['accounts' => []]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('không có tài khoản')->assertExitCode(1);
    }

    public function test_silence_during_active_hours_exits_1(): void
    {
        $this->heartbeat(['last_message_at' => now()->subMinutes(11)->getTimestampMs()]);

        $this->artisan('zalo:service-status')->expectsOutputToContain('Không có tin mới')->assertExitCode(1);
    }

    public function test_silence_outside_active_hours_is_not_an_alert(): void
    {
        $this->travelTo(Carbon::parse('2026-10-05 02:00:00'));
        $this->heartbeat(['last_message_at' => null]);

        $this->artisan('zalo:service-status')->assertExitCode(0);
    }

    public function test_invalid_heartbeat_is_422(): void
    {
        $this->zaloPost('/api/internal/zalo/heartbeat', ['service_id' => 'zalo-1'])->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=ZaloServiceStatusTest`
Expected: FAIL — heartbeat trả 404, `Command "zalo:service-status" is not defined`

- [ ] **Step 3: Implement monitor, controller, route, command, healthcheck**

`backend/app/Services/Zalo/ZaloServiceMonitor.php`:

```php
<?php

namespace App\Services\Zalo;

use Illuminate\Support\Facades\Cache;

/**
 * Theo dõi service Zalo qua heartbeat (lưu cache). Service hỏng là hỏng ÂM THẦM:
 * tab Free đứng yên mà không có lỗi nào — nên phải chủ động kiểm.
 * Laravel không có tin thô (nằm ở SQLite của service), nên nhịp tin lấy từ
 * last_message_at trong heartbeat.
 */
class ZaloServiceMonitor
{
    private const SERVICES_KEY = 'zalo:services';

    public function recordHeartbeat(array $data): void
    {
        $services = Cache::get(self::SERVICES_KEY, []);
        $services[$data['service_id']] = true;
        Cache::forever(self::SERVICES_KEY, $services);

        Cache::put(
            "zalo:heartbeat:{$data['service_id']}",
            $data + ['received_at' => now()->timestamp],
            now()->addDay()
        );
    }

    /** @return array{status: int, lines: list<string>} 0 ổn, 1 có vấn đề, 2 chưa service nào báo */
    public function status(): array
    {
        $now = now();
        $services = array_keys(Cache::get(self::SERVICES_KEY, []));
        if ($services === []) {
            return ['status' => 2, 'lines' => ['Chưa có service Zalo nào từng gửi heartbeat']];
        }

        $status = 0;
        $lines = [];
        $lastMessageMs = null;

        foreach ($services as $id) {
            $hb = Cache::get("zalo:heartbeat:{$id}");
            $age = $hb === null ? null : $now->timestamp - $hb['received_at'];

            if ($age === null || $age > (int) config('zalo.heartbeat_stale_seconds')) {
                $status = 1;
                $lines[] = "{$id}: mất heartbeat".($age === null ? '' : " ({$age} giây)");
                continue;
            }

            $down = collect($hb['accounts'])->where('connected', false)->pluck('id')->all();
            if ($hb['accounts'] === []) {
                $status = 1;
                $lines[] = "{$id}: không có tài khoản Zalo nào";
            } elseif ($down !== []) {
                $status = 1;
                $lines[] = "{$id}: tài khoản mất kết nối: ".implode(', ', $down);
            } else {
                $lines[] = "{$id}: OK (".count($hb['accounts'])." tài khoản, đã lưu {$hb['stored_total']} tin, trùng {$hb['duplicates_total']})";
            }

            if ($hb['last_message_at'] !== null) {
                $lastMessageMs = max($lastMessageMs ?? 0, (int) $hb['last_message_at']);
            }
        }

        [$from, $to] = config('zalo.active_hours');
        if ($now->hour >= $from && $now->hour < $to) {
            $minutes = (int) config('zalo.silence_alert_minutes');
            if ($lastMessageMs === null || $lastMessageMs < $now->copy()->subMinutes($minutes)->getTimestampMs()) {
                $status = 1;
                $lines[] = "Không có tin mới trong {$minutes} phút (300 nhóm mà im là bất thường)";
            }
        }

        return ['status' => $status, 'lines' => $lines];
    }
}
```

`backend/app/Http/Controllers/Webhooks/ZaloServiceController.php`:

```php
<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Endpoint cho microservice Zalo (Node). Giai đoạn 2 thêm rides, groups, config.
class ZaloServiceController extends Controller
{
    public function heartbeat(Request $request, ZaloServiceMonitor $monitor): JsonResponse
    {
        $data = $request->validate([
            'service_id'           => ['required', 'string', 'max:64'],
            'uptime_s'             => ['required', 'integer', 'min:0'],
            'accounts'             => ['present', 'array'],
            'accounts.*.id'        => ['required', 'string', 'max:64'],
            'accounts.*.connected' => ['required', 'boolean'],
            'received_total'       => ['required', 'integer', 'min:0'],
            'stored_total'         => ['required', 'integer', 'min:0'],
            'duplicates_total'     => ['required', 'integer', 'min:0'],
            'skipped_non_text'     => ['required', 'integer', 'min:0'],
            'last_message_at'      => ['present', 'nullable', 'integer', 'min:0'],
        ]);

        $monitor->recordHeartbeat($data);

        return response()->json(['ok' => true]);
    }
}
```

`backend/routes/api.php` — thêm `use App\Http\Controllers\Webhooks\ZaloServiceController;` cạnh import `SepayWebhookController`, rồi ngay sau dòng `Route::post('/webhooks/sepay', ...)`:

```php
// Microservice Zalo (Cuốc Free) — xác thực bằng chữ ký HMAC, không dùng Sanctum.
Route::middleware(['zalo.bot', 'throttle:120,1'])->prefix('internal/zalo')->group(function () {
    Route::post('/heartbeat', [ZaloServiceController::class, 'heartbeat']);
});
```

`backend/app/Console/Commands/ZaloServiceStatus.php`:

```php
<?php

namespace App\Console\Commands;

use App\Services\Zalo\ZaloServiceMonitor;
use Illuminate\Console\Command;

/**
 * Tình trạng service Zalo cho script giám sát (deploy/monitoring/greenca-healthcheck.sh).
 *
 * Quy ước exit code:
 *   0 = ổn
 *   1 = có vấn đề (mất heartbeat, tài khoản mất kết nối, im lặng bất thường trong giờ hoạt động)
 *   2 = chưa service nào từng gửi heartbeat (mới bật tính năng, chưa chạy service)
 */
class ZaloServiceStatus extends Command
{
    protected $signature = 'zalo:service-status';

    protected $description = 'Kiểm tra microservice Zalo (Cuốc Free) còn sống';

    public function handle(ZaloServiceMonitor $monitor): int
    {
        $result = $monitor->status();
        foreach ($result['lines'] as $line) {
            $this->line($line);
        }

        return $result['status'];
    }
}
```

`deploy/monitoring/greenca-healthcheck.sh` — chèn trước dòng `# ── So với lần trước, chỉ báo khi ĐỔI trạng thái`:

```bash
# 5) Microservice Zalo (Cuốc Free) — chỉ kiểm khi đã bật. Chạy bằng www-data
#    (artisan chạy bằng root có thể tạo file cache/log thuộc root → web 500).
if grep -qE '^ZALO_SERVICE_ENABLED=(true|1)$' "$ENV_FILE"; then
    zalo_out=$(cd "$APP_DIR" && sudo -u www-data php artisan zalo:service-status 2>&1)
    zalo_code=$?
    if [ "$zalo_code" -eq 1 ]; then
        problems+=("SERVICE ZALO CÓ VẤN ĐỀ → tab Cuốc Free ngừng cập nhật: $(echo "$zalo_out" | tr '\n' ' ' | head -c 300)")
    elif [ "$zalo_code" -ne 0 ]; then
        problems+=("SERVICE ZALO CHƯA TỪNG GỬI HEARTBEAT (đã bật ZALO_SERVICE_ENABLED nhưng service chưa chạy?)")
    fi
fi

```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T app php artisan test --filter=ZaloServiceStatusTest`
Expected: PASS (8 tests)

Run: `bash -n deploy/monitoring/greenca-healthcheck.sh && echo syntax-ok`
Expected: `syntax-ok`

Run: `docker compose exec -T app php artisan test`
Expected: các test Zalo pass; không test nào khác chuyển sang fail so với trước khi bắt đầu (nếu máy còn code Goong proxy chưa commit thì `PlacesProxyTest` fail sẵn từ trước — không liên quan).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Zalo/ZaloServiceMonitor.php backend/app/Http/Controllers/Webhooks/ZaloServiceController.php backend/routes/api.php backend/app/Console/Commands/ZaloServiceStatus.php backend/tests/Feature/ZaloServiceStatusTest.php deploy/monitoring/greenca-healthcheck.sh
git commit -m "feat(zalo): heartbeat microservice + zalo:service-status, cảnh báo Telegram khi service chết/im lặng"
```

---

### Task 3: Service — khung TypeScript, cấu hình, ký HMAC, gửi request

**Files:**
- Create: `zalo-service/package.json`, `zalo-service/tsconfig.json`, `zalo-service/.gitignore`, `zalo-service/.env.example`
- Create: `zalo-service/src/logger.ts`, `zalo-service/src/config.ts`, `zalo-service/src/sign.ts`, `zalo-service/src/http.ts`
- Test: `zalo-service/test/config.test.ts`, `zalo-service/test/sign.test.ts`, `zalo-service/test/http.test.ts`

**Interfaces:**
- Consumes: hợp đồng chữ ký + vector mẫu (Task 1).
- Produces:
  - `interface Logger { info(...args: unknown[]): void; error(...args: unknown[]): void }`, `logger`, `silentLogger`.
  - `loadConfig(env: NodeJS.ProcessEnv): Config` với `Config = { apiBaseUrl, botSecret, serviceId, dataDir, dbPath, accountsDir, heartbeatMs, accountRetryMs, retentionDays, duplicateWindowHours, maxContentLength }` (ném lỗi nếu thiếu `API_BASE_URL` / `BOT_SECRET`).
  - `sign(secret: string, body: string, nowMs?: number): { timestamp: string; signature: string }`.
  - `createSender({ baseUrl, secret, fetchImpl?, timeoutMs? }): (path: string, payload: unknown) => Promise<{ status: number; error?: string }>` — `status = 0` khi lỗi mạng, không ném.

- [ ] **Step 1: Create the project skeleton and install dependencies**

`zalo-service/package.json`:

```json
{
  "name": "greenca-zalo-service",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "start": "node dist/src/index.js",
    "login": "tsx scripts/login.ts",
    "stats": "node dist/src/cli/stats.js",
    "test": "node --import tsx --test test/*.test.ts"
  }
}
```

`zalo-service/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "scripts", "test"]
}
```

`zalo-service/.gitignore`:

```
node_modules/
dist/
data/
.env
```

`zalo-service/.env.example`:

```
# URL gốc backend Laravel (không có dấu / cuối)
API_BASE_URL=https://greenca.vn
# Trùng ZALO_BOT_SECRET trong backend/.env
BOT_SECRET=
SERVICE_ID=zalo-1
# Thư mục dữ liệu: zalo.sqlite + accounts/<tên>.json (phiên đăng nhập từng tài khoản phụ)
DATA_DIR=/opt/greenca-zalo-service/data
```

Run:

```bash
cd zalo-service
npm install zca-js@2.2.0 better-sqlite3
npm install -D typescript tsx @types/node@20 @types/better-sqlite3
```

Expected: `package.json` có `dependencies` (`zca-js` đúng `2.2.0`, `better-sqlite3`) và `devDependencies`; có `package-lock.json`.

- [ ] **Step 2: Write the failing tests**

`zalo-service/test/config.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('throws when required env is missing', () => {
  assert.throws(() => loadConfig({ BOT_SECRET: 'x' }), /API_BASE_URL/)
  assert.throws(() => loadConfig({ API_BASE_URL: 'https://a' }), /BOT_SECRET/)
})

test('applies defaults, derives paths and strips trailing slash', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://greenca.vn/', BOT_SECRET: 's', DATA_DIR: '/data' })
  assert.equal(cfg.apiBaseUrl, 'https://greenca.vn')
  assert.equal(cfg.serviceId, 'zalo-1')
  assert.equal(cfg.dbPath, '/data/zalo.sqlite')
  assert.equal(cfg.accountsDir, '/data/accounts')
  assert.equal(cfg.heartbeatMs, 60_000)
  assert.equal(cfg.accountRetryMs, 60_000)
  assert.equal(cfg.retentionDays, 7)
  assert.equal(cfg.duplicateWindowHours, 24)
  assert.equal(cfg.maxContentLength, 4000)
})
```

`zalo-service/test/sign.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sign } from '../src/sign.js'

// Cùng vector với ZaloBotSignatureTest::test_known_vector_shared_with_node_service_passes (PHP).
test('matches the vector shared with the Laravel middleware', () => {
  const body = '{"bot_id":"bot-1","messages":[{"content":"4h30 Tiễn Hoài Đức"}]}'
  const { timestamp, signature } = sign('test-secret', body, 1_700_000_000_000)
  assert.equal(timestamp, '1700000000')
  assert.equal(signature, '1b79231e73c3fcd9383c96d959e1b1fcd6376675df5231d2ea3e66e943aeb4b7')
})
```

`zalo-service/test/http.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSender } from '../src/http.js'
import { sign } from '../src/sign.js'

test('posts signed JSON and returns the status', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured = { url, init }
    return { status: 200 } as Response
  }) as unknown as typeof fetch
  const send = createSender({ baseUrl: 'https://greenca.vn', secret: 's', fetchImpl })

  const res = await send('/api/internal/zalo/heartbeat', { service_id: 'zalo-1' })

  assert.deepEqual(res, { status: 200 })
  assert.ok(captured)
  assert.equal(captured.url, 'https://greenca.vn/api/internal/zalo/heartbeat')
  assert.equal(captured.init.body, '{"service_id":"zalo-1"}')
  const headers = captured.init.headers as Record<string, string>
  const expected = sign('s', '{"service_id":"zalo-1"}', Number(headers['X-Zalo-Timestamp']) * 1000).signature
  assert.equal(headers['X-Zalo-Signature'], expected)
})

test('returns status 0 instead of throwing on network error', async () => {
  const fetchImpl = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
  const send = createSender({ baseUrl: 'https://x', secret: 's', fetchImpl })

  const res = await send('/p', {})

  assert.equal(res.status, 0)
  assert.match(res.error ?? '', /ECONNREFUSED/)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/config.js'`

- [ ] **Step 4: Implement the modules**

`zalo-service/src/logger.ts`:

```ts
export interface Logger {
  info(...args: unknown[]): void
  error(...args: unknown[]): void
}

const ts = () => new Date().toISOString()

export const logger: Logger = {
  info: (...args) => console.log(ts(), ...args),
  error: (...args) => console.error(ts(), ...args),
}

export const silentLogger: Logger = { info() {}, error() {} }
```

`zalo-service/src/config.ts`:

```ts
import { join } from 'node:path'

export interface Config {
  apiBaseUrl: string
  botSecret: string
  serviceId: string
  dataDir: string
  dbPath: string
  accountsDir: string
  heartbeatMs: number
  accountRetryMs: number
  retentionDays: number
  duplicateWindowHours: number
  maxContentLength: number
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const need = (key: string): string => {
    const value = env[key]
    if (!value) throw new Error(`Thiếu biến môi trường ${key}`)
    return value
  }
  const dataDir = env.DATA_DIR || './data'

  return {
    apiBaseUrl: need('API_BASE_URL').replace(/\/$/, ''),
    botSecret: need('BOT_SECRET'),
    serviceId: env.SERVICE_ID || 'zalo-1',
    dataDir,
    dbPath: join(dataDir, 'zalo.sqlite'),
    accountsDir: join(dataDir, 'accounts'),
    heartbeatMs: Number(env.HEARTBEAT_MS || 60_000),
    accountRetryMs: Number(env.ACCOUNT_RETRY_MS || 60_000),
    retentionDays: Number(env.RETENTION_DAYS || 7),
    duplicateWindowHours: Number(env.DUPLICATE_WINDOW_HOURS || 24),
    maxContentLength: Number(env.MAX_CONTENT_LENGTH || 4000),
  }
}
```

`zalo-service/src/sign.ts`:

```ts
import { createHmac } from 'node:crypto'

// Khớp VerifyZaloBotSignature (Laravel): hex HMAC-SHA256(secret, `${timestamp}.${body}`).
// Ký trên CHÍNH chuỗi body sẽ gửi đi — không stringify lại lần nữa.
export function sign(secret: string, body: string, nowMs: number = Date.now()): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(nowMs / 1000))
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return { timestamp, signature }
}
```

`zalo-service/src/http.ts`:

```ts
import { sign } from './sign.js'

export type Sender = (path: string, payload: unknown) => Promise<{ status: number; error?: string }>

// Trả { status } thay vì ném lỗi; status = 0 nghĩa là lỗi mạng / timeout.
export function createSender(opts: {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Sender {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000

  return async (path, payload) => {
    const body = JSON.stringify(payload)
    const { timestamp, signature } = sign(opts.secret, body)

    try {
      const res = await fetchImpl(opts.baseUrl + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Zalo-Timestamp': timestamp,
          'X-Zalo-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      return { status: res.status }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck không lỗi

- [ ] **Step 6: Commit**

```bash
git add zalo-service/package.json zalo-service/package-lock.json zalo-service/tsconfig.json zalo-service/.gitignore zalo-service/.env.example zalo-service/src/logger.ts zalo-service/src/config.ts zalo-service/src/sign.ts zalo-service/src/http.ts zalo-service/test/config.test.ts zalo-service/test/sign.test.ts zalo-service/test/http.test.ts
git commit -m "feat(zalo-service): khung TypeScript, cấu hình, ký HMAC khớp Laravel, gửi request"
```

---

### Task 4: Service — SQLite, lưu tin thô (idempotent, chống trùng), dọn tin, thống kê

**Files:**
- Create: `zalo-service/src/text.ts`, `zalo-service/src/db.ts`, `zalo-service/src/normalize.ts` (chỉ khai báo kiểu ở task này), `zalo-service/src/store.ts`, `zalo-service/src/stats.ts`
- Test: `zalo-service/test/text.test.ts`, `zalo-service/test/store.test.ts`, `zalo-service/test/stats.test.ts`

**Interfaces:**
- Produces:
  - `normalize(text: string): string`, `contentHash(senderUid: string, text: string): string` (64 ký tự hex), `looksTimed(text: string): boolean`.
  - `type Db = Database.Database`, `openDb(path: string): Db` (`':memory:'` dùng cho test).
  - `interface MessageItem { group_id: string; group_name: string; msg_id: string; sender_uid: string; sender_name: string; content: string; sent_at: number }` (trong `src/normalize.ts`; Task 5 thêm hàm `toItem` vào cùng file).
  - `type SaveResult = 'stored' | 'duplicate' | 'ignored'`; `class MessageStore(db: Db, opts: { duplicateWindowMs: number; maxContentLength: number; retentionMs: number })` với `save(item: MessageItem, accountId: string, receivedAt?: number): SaveResult` và `prune(now?: number): number`.
  - `computeStats(db: Db, hours: number, now?: number): StatsReport`, `formatStats(report: StatsReport, hours: number): string`, `StatsReport = { total, duplicates, unique, timed, senders, groups, topGroups: { name: string; total: number }[] }`.

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/text.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentHash, looksTimed, normalize } from '../src/text.js'

test('normalize collapses spacing, case and zero-width chars', () => {
  assert.equal(
    normalize('  4h30\tTiễn   khu đất dịch vụ​ xã Hoài Đức\n280,000đ '),
    '4h30 tiễn khu đất dịch vụ xã hoài đức 280,000đ',
  )
})

test('hash is the same for a reformatted text from the same sender', () => {
  const a = contentHash('111', '4h30 Tiễn Hoài Đức 280k')
  assert.equal(a, contentHash('111', '4h30  tiễn hoài đức\n280k'))
  assert.equal(a.length, 64)
  assert.notEqual(a, contentHash('222', '4h30 Tiễn Hoài Đức 280k'))
})

test('looksTimed detects common time formats only', () => {
  for (const t of ['5h tran nhan tong 200k', 'tiễn 4h15 phố cổ', '4/10 _7h00_ 50 Nguyễn Chí Thanh', '12:30 khánh hội']) {
    assert.equal(looksTimed(t), true, t)
  }
  for (const t of ['chào cả nhà', 'ck 200 0.25', 'xe 5 TK 0.25 280,000đ']) {
    assert.equal(looksTimed(t), false, t)
  }
})
```

`zalo-service/test/store.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import type { MessageItem } from '../src/normalize.js'

const HOUR = 3_600_000
const T0 = 1_730_000_000_000
let seq = 0

function item(overrides: Partial<MessageItem> = {}): MessageItem {
  seq++
  return {
    group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: String(1000 + seq), sender_uid: '111',
    sender_name: 'Hoàng Anh Đức', content: `tiễn 4h15 phố cổ ck 200 #${seq}`, sent_at: T0, ...overrides,
  }
}

function setup() {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c
  return { db, store, count }
}

test('stores a message with its group and sender', () => {
  const { db, store, count } = setup()
  assert.equal(store.save(item(), 'acc1', T0), 'stored')
  assert.equal(count("SELECT COUNT(*) AS c FROM messages WHERE parse_status = 'pending' AND account_id = 'acc1'"), 1)
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  assert.deepEqual(db.prepare('SELECT display_name FROM senders').get(), { display_name: 'Hoàng Anh Đức' })
})

test('same message heard by two accounts is stored once', () => {
  const { store, count } = setup()
  const m = item()
  assert.equal(store.save(m, 'acc1'), 'stored')
  assert.equal(store.save(m, 'acc2'), 'ignored')
  assert.equal(count('SELECT COUNT(*) AS c FROM messages'), 1)
})

test('reformatted repost in another group within 24h is duplicate', () => {
  const { store } = setup()
  assert.equal(store.save(item({ content: 'tiễn 5h Tràng An 200k' }), 'acc1'), 'stored')
  assert.equal(store.save(item({ group_id: 'g2', content: 'Tiễn  5h tràng an\n200k', sent_at: T0 + HOUR }), 'acc1'), 'duplicate')
})

test('same content from a different sender is not duplicate', () => {
  const { store } = setup()
  store.save(item({ content: 'tiễn 5h Tràng An 200k' }), 'acc1')
  assert.equal(store.save(item({ content: 'tiễn 5h Tràng An 200k', sender_uid: '222' }), 'acc1'), 'stored')
})

test('repost after the window is not duplicate', () => {
  const { store } = setup()
  store.save(item({ content: 'tiễn 6h Mỹ Đình' }), 'acc1')
  assert.equal(store.save(item({ content: 'tiễn 6h Mỹ Đình', sent_at: T0 + 25 * HOUR }), 'acc1'), 'stored')
})

test('long content and names are truncated, not rejected', () => {
  const { db, store } = setup()
  assert.equal(store.save(item({ content: 'a'.repeat(5000), group_name: 'n'.repeat(400), sender_name: 's'.repeat(400) }), 'acc1'), 'stored')
  assert.equal((db.prepare('SELECT length(content) AS l FROM messages').get() as { l: number }).l, 4000)
  assert.equal((db.prepare('SELECT length(name) AS l FROM chat_groups').get() as { l: number }).l, 255)
  assert.equal((db.prepare('SELECT length(display_name) AS l FROM senders').get() as { l: number }).l, 255)
})

test('empty group name keeps the known name; a new name renames', () => {
  const { db, store } = setup()
  store.save(item({ group_name: 'Taxi Nội Bài' }), 'acc1')
  store.save(item({ group_name: '' }), 'acc1')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  store.save(item({ group_name: 'Taxi Nội Bài 24/7' }), 'acc1')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài 24/7' })
})

test('prune deletes only messages older than retention', () => {
  const { store, count } = setup()
  store.save(item({ sent_at: T0 - 8 * 24 * HOUR }), 'acc1')
  store.save(item({ sent_at: T0 - 6 * 24 * HOUR }), 'acc1')
  assert.equal(store.prune(T0), 1)
  assert.equal(count('SELECT COUNT(*) AS c FROM messages'), 1)
})
```

`zalo-service/test/stats.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { computeStats, formatStats } from '../src/stats.js'

const HOUR = 3_600_000
const T0 = 1_730_000_000_000

test('reports duplicates, timed share and top groups', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const base = { group_name: '', sender_name: '', sent_at: T0 }
  store.save({ ...base, group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: '1', sender_uid: 's1', content: 'tiễn 4h15 phố cổ ck 200' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '2', sender_uid: 's2', content: 'chào cả nhà' }, 'acc1')
  store.save({ ...base, group_id: 'g2', msg_id: '3', sender_uid: 's1', content: 'tiễn 4h15 phố cổ ck 200' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '4', sender_uid: 's3', content: 'đón T1 12:30 về Hà Đông' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '5', sender_uid: 's4', content: 'tin cũ', sent_at: T0 - 72 * HOUR }, 'acc1')

  const report = computeStats(db, 24, T0 + 60_000)

  assert.equal(report.total, 4)
  assert.equal(report.duplicates, 1)
  assert.equal(report.unique, 3)
  assert.equal(report.timed, 2)
  assert.equal(report.senders, 3)
  assert.equal(report.groups, 2)
  assert.deepEqual(report.topGroups[0], { name: 'Taxi Nội Bài', total: 3 })
  assert.deepEqual(report.topGroups[1], { name: 'g2', total: 1 })

  const text = formatStats(report, 24)
  assert.match(text, /Tin trùng \(bỏ qua\): 1 \(25\.0%\)/)
  assert.match(text, /có dấu hiệu giờ \(giống cuốc\): 2 \(66\.7%\)/)
})

test('formatStats with no data says so', () => {
  const db = openDb(':memory:')
  assert.match(formatStats(computeStats(db, 24), 24), /Chưa có tin nào/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/text.js'` (và `db.js`, `store.js`, `stats.js`)

- [ ] **Step 3: Implement text, db, types, store, stats**

`zalo-service/src/text.ts`:

```ts
import { createHash } from 'node:crypto'

// Bỏ ký tự vô hình, gộp khoảng trắng, chữ thường — giữ nguyên dấu tiếng Việt.
export function normalize(text: string): string {
  return text.replace(/[​-‍﻿]/g, '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

export function contentHash(senderUid: string, text: string): string {
  return createHash('sha256').update(`${senderUid}\n${normalize(text)}`).digest('hex')
}

// Dấu hiệu "có giờ" (5h, 4h15, 7h00, 12:30). Chỉ dùng ước lượng tỷ lệ tin giống cuốc
// trong thống kê — KHÔNG dùng để quyết định tin có phải cuốc hay không.
export function looksTimed(text: string): boolean {
  return /(?<!\d)\d{1,2}\s*(?:h|g|:)\s*\d{0,2}/iu.test(text)
}
```

`zalo-service/src/db.ts`:

```ts
import Database from 'better-sqlite3'

export type Db = Database.Database

// Bảng nhóm đặt tên chat_groups vì GROUPS là từ khoá của SQLite (window function).
const SCHEMA = `
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
`

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}
```

`zalo-service/src/normalize.ts` (Task 5 bổ sung `toItem` vào file này):

```ts
export interface MessageItem {
  group_id: string
  group_name: string
  msg_id: string
  sender_uid: string
  sender_name: string
  content: string
  sent_at: number
}
```

`zalo-service/src/store.ts`:

```ts
import type Database from 'better-sqlite3'
import type { Db } from './db.js'
import type { MessageItem } from './normalize.js'
import { contentHash } from './text.js'

export type SaveResult = 'stored' | 'duplicate' | 'ignored'

export interface StoreOptions {
  duplicateWindowMs: number
  maxContentLength: number
  retentionMs: number
}

const MAX_NAME = 255

/**
 * Lưu tin thô — nguyên tắc "lưu ngay khi nhận": gọi đồng bộ trong một transaction.
 * - Idempotent theo (nhóm, msg_id): 2 tài khoản phụ cùng ở một nhóm nghe cùng một tin → lưu 1 lần.
 * - duplicate: cùng người gửi + cùng nội dung đã chuẩn hoá, sent_at cách nhau ≤ duplicateWindowMs.
 * - Tên rỗng không ghi đè tên đã biết; nội dung/tên quá dài thì cắt, không từ chối.
 */
export class MessageStore {
  private readonly exists: Database.Statement
  private readonly seenHash: Database.Statement
  private readonly insert: Database.Statement
  private readonly upsertGroup: Database.Statement
  private readonly upsertSender: Database.Statement
  private readonly deleteOld: Database.Statement
  private readonly saveTx: (item: MessageItem, accountId: string, receivedAt: number) => SaveResult

  constructor(db: Db, private readonly opts: StoreOptions) {
    this.exists = db.prepare('SELECT 1 FROM messages WHERE zalo_group_id = ? AND zalo_msg_id = ?')
    this.seenHash = db.prepare('SELECT 1 FROM messages WHERE content_hash = ? AND sent_at >= ? LIMIT 1')
    this.insert = db.prepare(`
      INSERT INTO messages (zalo_group_id, zalo_msg_id, sender_uid, account_id, content, content_hash, sent_at, received_at, parse_status)
      VALUES (@groupId, @msgId, @senderUid, @accountId, @content, @hash, @sentAt, @receivedAt, @status)`)
    this.upsertGroup = db.prepare(`
      INSERT INTO chat_groups (zalo_group_id, name, last_message_at) VALUES (?, ?, ?)
      ON CONFLICT (zalo_group_id) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE chat_groups.name END,
        last_message_at = MAX(COALESCE(chat_groups.last_message_at, 0), excluded.last_message_at)`)
    this.upsertSender = db.prepare(`
      INSERT INTO senders (uid, display_name, last_seen_at) VALUES (?, ?, ?)
      ON CONFLICT (uid) DO UPDATE SET
        display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE senders.display_name END,
        last_seen_at = MAX(COALESCE(senders.last_seen_at, 0), excluded.last_seen_at)`)
    this.deleteOld = db.prepare('DELETE FROM messages WHERE sent_at < ?')

    this.saveTx = db.transaction((item: MessageItem, accountId: string, receivedAt: number): SaveResult => {
      if (this.exists.get(item.group_id, item.msg_id)) return 'ignored'

      this.upsertGroup.run(item.group_id, item.group_name.slice(0, MAX_NAME), item.sent_at)
      this.upsertSender.run(item.sender_uid, item.sender_name.slice(0, MAX_NAME), item.sent_at)

      const hash = contentHash(item.sender_uid, item.content)
      const isDuplicate = Boolean(this.seenHash.get(hash, item.sent_at - this.opts.duplicateWindowMs))

      this.insert.run({
        groupId: item.group_id,
        msgId: item.msg_id,
        senderUid: item.sender_uid,
        accountId,
        content: item.content.slice(0, this.opts.maxContentLength),
        hash,
        sentAt: item.sent_at,
        receivedAt,
        status: isDuplicate ? 'duplicate' : 'pending',
      })
      return isDuplicate ? 'duplicate' : 'stored'
    })
  }

  save(item: MessageItem, accountId: string, receivedAt: number = Date.now()): SaveResult {
    return this.saveTx(item, accountId, receivedAt)
  }

  prune(now: number = Date.now()): number {
    return this.deleteOld.run(now - this.opts.retentionMs).changes
  }
}
```

`zalo-service/src/stats.ts`:

```ts
import type { Db } from './db.js'
import { looksTimed } from './text.js'

export interface StatsReport {
  total: number
  duplicates: number
  unique: number
  timed: number
  senders: number
  groups: number
  topGroups: { name: string; total: number }[]
}

// Số liệu để chốt chi phí AI với GreenCA sau 2–3 ngày thu thập.
export function computeStats(db: Db, hours: number, now: number = Date.now()): StatsReport {
  const from = now - hours * 3_600_000
  const one = (sql: string) => (db.prepare(sql).get(from) as { c: number }).c

  const total = one('SELECT COUNT(*) AS c FROM messages WHERE sent_at >= ?')
  const duplicates = one("SELECT COUNT(*) AS c FROM messages WHERE sent_at >= ? AND parse_status = 'duplicate'")

  let timed = 0
  const rows = db.prepare("SELECT content FROM messages WHERE sent_at >= ? AND parse_status <> 'duplicate'").iterate(from)
  for (const row of rows as Iterable<{ content: string }>) {
    if (looksTimed(row.content)) timed++
  }

  const topGroups = db.prepare(`
    SELECT COALESCE(NULLIF(g.name, ''), m.zalo_group_id) AS name, COUNT(*) AS total
    FROM messages m LEFT JOIN chat_groups g ON g.zalo_group_id = m.zalo_group_id
    WHERE m.sent_at >= ?
    GROUP BY m.zalo_group_id ORDER BY total DESC LIMIT 10`).all(from) as { name: string; total: number }[]

  return {
    total,
    duplicates,
    unique: total - duplicates,
    timed,
    senders: one('SELECT COUNT(DISTINCT sender_uid) AS c FROM messages WHERE sent_at >= ?'),
    groups: one('SELECT COUNT(DISTINCT zalo_group_id) AS c FROM messages WHERE sent_at >= ?'),
    topGroups,
  }
}

export function formatStats(r: StatsReport, hours: number): string {
  if (r.total === 0) return `Chưa có tin nào trong ${hours} giờ qua`

  const pct = (part: number, whole: number) => `${part} (${whole > 0 ? ((part * 100) / whole).toFixed(1) : '0.0'}%)`
  return [
    `Thống kê ${hours} giờ qua`,
    `Tổng tin: ${r.total}`,
    `Tin trùng (bỏ qua): ${pct(r.duplicates, r.total)}`,
    `Tin không trùng: ${r.unique}`,
    `  trong đó có dấu hiệu giờ (giống cuốc): ${pct(r.timed, r.unique)}`,
    `Số người gửi: ${r.senders}`,
    `Số nhóm có tin: ${r.groups}`,
    'Top nhóm nhiều tin:',
    ...r.topGroups.map((g) => `  ${g.total}\t${g.name}`),
  ].join('\n')
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck không lỗi

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/text.ts zalo-service/src/db.ts zalo-service/src/normalize.ts zalo-service/src/store.ts zalo-service/src/stats.ts zalo-service/test/text.test.ts zalo-service/test/store.test.ts zalo-service/test/stats.test.ts
git commit -m "feat(zalo-service): lưu tin thô vào SQLite — idempotent đa tài khoản, chống trùng 24h, dọn 7 ngày, thống kê"
```

---

### Task 5: Service — chuẩn hoá tin zca-js, cache tên nhóm, xử lý một tin, payload heartbeat

**Files:**
- Modify: `zalo-service/src/normalize.ts` (thêm `IncomingMessage`, `toItem`)
- Create: `zalo-service/src/groups.ts`, `zalo-service/src/ingest.ts`, `zalo-service/src/heartbeat.ts`
- Test: `zalo-service/test/normalize.test.ts`, `zalo-service/test/groups.test.ts`, `zalo-service/test/ingest.test.ts`, `zalo-service/test/heartbeat.test.ts`

**Interfaces:**
- Consumes: `MessageItem`, `MessageStore`, `SaveResult`, `openDb` (Task 4).
- Produces:
  - `interface IncomingMessage { type: number; isSelf: boolean; threadId: string; data: { msgId: string; uidFrom: string; dName?: string; ts: string; content: unknown } }` — tập con trường của tin zca-js mà service dùng.
  - `toItem(message: IncomingMessage): { item: MessageItem } | { skip: 'not_group' | 'non_text' }`.
  - `class GroupNames({ fetchName: (groupId: string) => Promise<string>; ttlMs?: number; now?: () => number })` với `get(groupId: string): Promise<string>`.
  - `interface ServiceCounters { received; stored; duplicates; ignored; skippedNonText: number; lastMessageAt: number | null }`, `newCounters(): ServiceCounters`.
  - `createIngestor({ store, groups, counters, now? }): (accountId: string, message: IncomingMessage) => Promise<SaveResult | 'not_group' | 'non_text'>`.
  - `buildHeartbeat({ serviceId, startedAt, now, counters, accounts: { id: string; connected: boolean }[] })` → đúng payload heartbeat ở Task 2.

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/normalize.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toItem, type IncomingMessage } from '../src/normalize.js'

const groupText: IncomingMessage = {
  type: 1, isSelf: false, threadId: '2654386762368849522',
  data: { msgId: '7001', uidFrom: '111', dName: 'Hoàng Anh Đức', ts: '1730000000123', content: 'tiễn 4h15 phố cổ' },
}

test('maps a group text message to an item', () => {
  assert.deepEqual(toItem(groupText), {
    item: {
      group_id: '2654386762368849522', group_name: '', msg_id: '7001', sender_uid: '111',
      sender_name: 'Hoàng Anh Đức', content: 'tiễn 4h15 phố cổ', sent_at: 1730000000123,
    },
  })
})

test('skips direct messages and own messages', () => {
  assert.deepEqual(toItem({ ...groupText, type: 0 }), { skip: 'not_group' })
  assert.deepEqual(toItem({ ...groupText, isSelf: true }), { skip: 'not_group' })
})

test('skips stickers, images and blank text', () => {
  assert.deepEqual(toItem({ ...groupText, data: { ...groupText.data, content: { href: 'x.jpg' } } }), { skip: 'non_text' })
  assert.deepEqual(toItem({ ...groupText, data: { ...groupText.data, content: '   ' } }), { skip: 'non_text' })
})
```

`zalo-service/test/groups.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GroupNames } from '../src/groups.js'

test('fetches once, caches, and refreshes after ttl', async () => {
  let calls = 0
  let t = 0
  const names = new GroupNames({ fetchName: async () => `Nhóm ${++calls}`, ttlMs: 1000, now: () => t })
  assert.equal(await names.get('g1'), 'Nhóm 1')
  assert.equal(await names.get('g1'), 'Nhóm 1')
  assert.equal(calls, 1)
  t = 2000
  assert.equal(await names.get('g1'), 'Nhóm 2')
})

test('concurrent lookups share one request', async () => {
  let calls = 0
  const names = new GroupNames({ fetchName: async () => { calls++; return 'A' } })
  await Promise.all([names.get('g1'), names.get('g1'), names.get('g1')])
  assert.equal(calls, 1)
})

test('falls back to the previous name (or empty) when lookup fails', async () => {
  let t = 0
  let fail = false
  const names = new GroupNames({ fetchName: async () => { if (fail) throw new Error('x'); return 'Cũ' }, ttlMs: 10, now: () => t })
  assert.equal(await names.get('g1'), 'Cũ')
  fail = true
  t = 100
  assert.equal(await names.get('g1'), 'Cũ')
  assert.equal(await names.get('g2'), '')
})

test('a failed lookup is cached too — no getGroupInfo call per message', async () => {
  let calls = 0
  const names = new GroupNames({ fetchName: async () => { calls++; throw new Error('x') } })
  await names.get('g1')
  await names.get('g1')
  await names.get('g1')
  assert.equal(calls, 1)
})
```

`zalo-service/test/ingest.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { GroupNames } from '../src/groups.js'
import { createIngestor, newCounters } from '../src/ingest.js'
import type { IncomingMessage } from '../src/normalize.js'

const HOUR = 3_600_000

function setup() {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const groups = new GroupNames({ fetchName: async () => 'Taxi Nội Bài' })
  const counters = newCounters()
  const ingest = createIngestor({ store, groups, counters, now: () => 5_000 })
  return { db, ingest, counters }
}

function msg(msgId: string, content: unknown = 'tiễn 4h15 phố cổ'): IncomingMessage {
  return { type: 1, isSelf: false, threadId: 'g1', data: { msgId, uidFrom: '111', dName: 'Đức', ts: '1730000000000', content } }
}

test('stores a group text with the group name looked up', async () => {
  const { db, ingest, counters } = setup()
  assert.equal(await ingest('acc1', msg('1')), 'stored')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  assert.deepEqual(
    { received: counters.received, stored: counters.stored, lastMessageAt: counters.lastMessageAt },
    { received: 1, stored: 1, lastMessageAt: 5_000 },
  )
})

test('a second account hearing the same message counts as ignored', async () => {
  const { ingest, counters } = setup()
  await ingest('acc1', msg('1'))
  assert.equal(await ingest('acc2', msg('1')), 'ignored')
  assert.equal(counters.ignored, 1)
  assert.equal(counters.stored, 1)
})

test('duplicates are stored and counted', async () => {
  const { ingest, counters } = setup()
  await ingest('acc1', msg('1', 'đón T1 về Hà Đông 300k'))
  assert.equal(await ingest('acc1', { ...msg('2', 'đón T1 về Hà Đông 300k'), threadId: 'g2' }), 'duplicate')
  assert.equal(counters.stored, 2)
  assert.equal(counters.duplicates, 1)
})

test('non-text messages are skipped and counted', async () => {
  const { ingest, counters } = setup()
  assert.equal(await ingest('acc1', msg('1', { href: 'a.jpg' })), 'non_text')
  assert.equal(counters.skippedNonText, 1)
  assert.equal(counters.lastMessageAt, null)
})
```

`zalo-service/test/heartbeat.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat } from '../src/heartbeat.js'
import { newCounters } from '../src/ingest.js'

test('builds the payload expected by Laravel', () => {
  const counters = { ...newCounters(), received: 10, stored: 8, duplicates: 3, ignored: 1, skippedNonText: 1, lastMessageAt: 9_000 }
  assert.deepEqual(
    buildHeartbeat({
      serviceId: 'zalo-1', startedAt: 0, now: 125_400, counters,
      accounts: [{ id: 'acc1', connected: true }, { id: 'acc2', connected: false }],
    }),
    {
      service_id: 'zalo-1', uptime_s: 125,
      accounts: [{ id: 'acc1', connected: true }, { id: 'acc2', connected: false }],
      received_total: 10, stored_total: 8, duplicates_total: 3, skipped_non_text: 1, last_message_at: 9_000,
    },
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && npm test`
Expected: FAIL — `toItem` không được export; `Cannot find module '.../src/groups.js'` (và `ingest.js`, `heartbeat.js`)

- [ ] **Step 3: Implement**

`zalo-service/src/normalize.ts` — thay toàn bộ file:

```ts
export interface MessageItem {
  group_id: string
  group_name: string
  msg_id: string
  sender_uid: string
  sender_name: string
  content: string
  sent_at: number
}

// Tập con trường của tin zca-js mà service dùng (tránh phụ thuộc kiểu nội bộ của thư viện).
export interface IncomingMessage {
  type: number
  isSelf: boolean
  threadId: string
  data: { msgId: string; uidFrom: string; dName?: string; ts: string; content: unknown }
}

const THREAD_TYPE_GROUP = 1 // ThreadType.Group của zca-js

// Chỉ lấy tin CHỮ trong nhóm; ảnh/sticker/file được đếm rồi bỏ. group_name điền sau (GroupNames).
export function toItem(message: IncomingMessage): { item: MessageItem } | { skip: 'not_group' | 'non_text' } {
  if (message.type !== THREAD_TYPE_GROUP || message.isSelf) return { skip: 'not_group' }

  const d = message.data
  if (typeof d.content !== 'string' || d.content.trim() === '') return { skip: 'non_text' }

  return {
    item: {
      group_id: String(message.threadId),
      group_name: '',
      msg_id: String(d.msgId),
      sender_uid: String(d.uidFrom),
      sender_name: d.dName ?? '',
      content: d.content,
      sent_at: Number(d.ts),
    },
  }
}
```

`zalo-service/src/groups.ts`:

```ts
// Cache tên nhóm: tin zca-js không kèm tên nhóm, phải hỏi getGroupInfo.
// Lỗi tra cứu thì dùng tên cũ (hoặc rỗng — store không ghi đè tên đã biết bằng tên rỗng)
// và CACHE LUÔN kết quả dự phòng: không cache thì mỗi tin của nhóm lỗi lại gọi Zalo một lần,
// dễ làm tài khoản phụ bị chú ý.
export class GroupNames {
  private readonly fetchName: (groupId: string) => Promise<string>
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly cache = new Map<string, { name: string; at: number }>()
  private readonly pending = new Map<string, Promise<string>>()

  constructor(opts: { fetchName: (groupId: string) => Promise<string>; ttlMs?: number; now?: () => number }) {
    this.fetchName = opts.fetchName
    this.ttlMs = opts.ttlMs ?? 6 * 3_600_000
    this.now = opts.now ?? (() => Date.now())
  }

  get(groupId: string): Promise<string> {
    const hit = this.cache.get(groupId)
    if (hit && this.now() - hit.at < this.ttlMs) return Promise.resolve(hit.name)

    const inFlight = this.pending.get(groupId)
    if (inFlight) return inFlight

    const lookup = this.fetchName(groupId)
      .catch(() => hit?.name ?? '')
      .then((name) => {
        this.cache.set(groupId, { name, at: this.now() })
        return name
      })
      .finally(() => this.pending.delete(groupId))

    this.pending.set(groupId, lookup)
    return lookup
  }
}
```

`zalo-service/src/ingest.ts`:

```ts
import type { GroupNames } from './groups.js'
import { toItem, type IncomingMessage } from './normalize.js'
import type { MessageStore, SaveResult } from './store.js'

export interface ServiceCounters {
  received: number
  stored: number // gồm cả tin duplicate (vẫn được lưu để thống kê)
  duplicates: number
  ignored: number
  skippedNonText: number
  lastMessageAt: number | null
}

export function newCounters(): ServiceCounters {
  return { received: 0, stored: 0, duplicates: 0, ignored: 0, skippedNonText: 0, lastMessageAt: null }
}

// Xử lý MỘT tin ngay khi listener nhận (sơ đồ 6.2): chuẩn hoá → tên nhóm → lưu ngay → bộ đếm.
export function createIngestor(deps: {
  store: MessageStore
  groups: GroupNames
  counters: ServiceCounters
  now?: () => number
}): (accountId: string, message: IncomingMessage) => Promise<SaveResult | 'not_group' | 'non_text'> {
  const now = deps.now ?? (() => Date.now())

  return async (accountId, message) => {
    deps.counters.received++

    const result = toItem(message)
    if ('skip' in result) {
      if (result.skip === 'non_text') deps.counters.skippedNonText++
      return result.skip
    }

    const item = { ...result.item, group_name: await deps.groups.get(result.item.group_id) }
    const saved = deps.store.save(item, accountId, now())

    if (saved === 'ignored') {
      deps.counters.ignored++
    } else {
      deps.counters.stored++
      if (saved === 'duplicate') deps.counters.duplicates++
      deps.counters.lastMessageAt = now()
    }
    return saved
  }
}
```

`zalo-service/src/heartbeat.ts`:

```ts
import type { ServiceCounters } from './ingest.js'

// Payload khớp validate của ZaloServiceController::heartbeat (Laravel).
export function buildHeartbeat(input: {
  serviceId: string
  startedAt: number
  now: number
  counters: ServiceCounters
  accounts: { id: string; connected: boolean }[]
}) {
  return {
    service_id: input.serviceId,
    uptime_s: Math.round((input.now - input.startedAt) / 1000),
    accounts: input.accounts.map((a) => ({ id: a.id, connected: a.connected })),
    received_total: input.counters.received,
    stored_total: input.counters.stored,
    duplicates_total: input.counters.duplicates,
    skipped_non_text: input.counters.skippedNonText,
    last_message_at: input.counters.lastMessageAt,
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd zalo-service && npm test && npm run typecheck`
Expected: PASS (`# fail 0`), typecheck không lỗi

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/normalize.ts zalo-service/src/groups.ts zalo-service/src/ingest.ts zalo-service/src/heartbeat.ts zalo-service/test/normalize.test.ts zalo-service/test/groups.test.ts zalo-service/test/ingest.test.ts zalo-service/test/heartbeat.test.ts
git commit -m "feat(zalo-service): xử lý từng tin — chuẩn hoá, cache tên nhóm, lưu ngay, bộ đếm, payload heartbeat"
```

---

### Task 6: Service — quản lý N tài khoản, điểm khởi chạy, lệnh thống kê, đăng nhập QR

**Files:**
- Create: `zalo-service/src/accounts.ts`
- Create: `zalo-service/src/index.ts`
- Create: `zalo-service/src/cli/stats.ts`
- Create: `zalo-service/scripts/login.ts`
- Test: `zalo-service/test/accounts.test.ts`

**Interfaces:**
- Consumes: mọi export của Task 3–5; từ `zca-js` 2.2.0: `Zalo`, `LoginQRCallbackEventType`, `type Credentials` (`new Zalo(opts).login(credentials)` → api; `api.listener` phát `connected` / `disconnected` / `closed` / `error` / `message`; `api.listener.start({ retryOnClose: true })`; `api.getGroupInfo(id)` → `{ gridInfoMap: { [id]: { name } } }`; `loginQR(opts, cb)` phát `GotLoginInfo` với `data: { cookie, imei, userAgent }`).
- Produces:
  - `interface ApiLike { listener: ListenerLike; getOwnId(): string; getGroupInfo(groupId: string): Promise<{ gridInfoMap?: Record<string, { name?: string }> }> }`.
  - `interface AccountState { id: string; loggedIn: boolean; connected: boolean; lastError?: string }`.
  - `class AccountManager({ accounts, login, onMessage, logger, retryMs?, schedule? })` với `startAll(): Promise<void>`, `snapshot(): AccountState[]`, `anyApi(): ApiLike | undefined`, `stopAll(): void`.
  - Tiến trình `npm start`; `npm run stats -- --hours=72`; `npm run login -- <tên-tài-khoản>`.

- [ ] **Step 1: Write the failing test**

`zalo-service/test/accounts.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AccountManager, type ApiLike } from '../src/accounts.js'
import { silentLogger } from '../src/logger.js'

class FakeListener extends EventEmitter {
  started = false
  stopped = false
  start() { this.started = true }
  stop() { this.stopped = true }
}

function fakeApi(): ApiLike & { listener: FakeListener } {
  return { listener: new FakeListener(), getOwnId: () => 'own', getGroupInfo: async () => ({}) }
}

function harness(loginImpl: (credentials: unknown) => Promise<ApiLike>) {
  const scheduled: (() => void)[] = []
  const received: [string, unknown][] = []
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }, { id: 'acc2', credentials: 'c2' }],
    login: loginImpl,
    onMessage: (id, m) => received.push([id, m]),
    logger: silentLogger,
    retryMs: 10,
    schedule: (fn) => { scheduled.push(fn) },
  })
  return { manager, scheduled, received }
}

test('logs in every account, starts listeners and routes messages with the account id', async () => {
  const apis = new Map<unknown, ReturnType<typeof fakeApi>>()
  const { manager, received } = harness(async (c) => { const api = fakeApi(); apis.set(c, api); return api })

  await manager.startAll()
  assert.ok(apis.get('c1')?.listener.started)
  assert.ok(apis.get('c2')?.listener.started)

  apis.get('c2')!.listener.emit('message', { hello: 1 })
  assert.deepEqual(received, [['acc2', { hello: 1 }]])
})

test('connected and disconnected events update the snapshot', async () => {
  const api = fakeApi()
  const { manager } = harness(async () => api)
  await manager.startAll()

  api.listener.emit('connected')
  assert.ok(manager.snapshot().every((s) => s.connected))
  api.listener.emit('disconnected', 1000, 'bye')
  assert.ok(manager.snapshot().every((s) => !s.connected))
})

test('a failing account does not stop the others and is retried', async () => {
  let failAcc2 = true
  const { manager, scheduled } = harness(async (c) => {
    if (c === 'c2' && failAcc2) throw new Error('phiên hết hạn')
    return fakeApi()
  })

  await manager.startAll()
  const [acc1, acc2] = manager.snapshot()
  assert.equal(acc1.loggedIn, true)
  assert.equal(acc2.loggedIn, false)
  assert.equal(acc2.lastError, 'phiên hết hạn')
  assert.equal(scheduled.length, 1)
  assert.ok(manager.anyApi())

  failAcc2 = false
  scheduled[0]()
  await new Promise((r) => setImmediate(r))
  assert.equal(manager.snapshot().find((s) => s.id === 'acc2')?.loggedIn, true)
})

test('a closed listener marks the account down and schedules a re-login', async () => {
  const api = fakeApi()
  const { manager, scheduled } = harness(async () => api)
  await manager.startAll()
  api.listener.emit('connected')

  api.listener.emit('closed', 3000, 'kicked')
  assert.ok(manager.snapshot().every((s) => !s.connected && !s.loggedIn))
  assert.equal(scheduled.length, 2) // cả 2 tài khoản dùng chung fake api trong test này
})

test('stopAll stops every listener', async () => {
  const created: ReturnType<typeof fakeApi>[] = []
  const { manager } = harness(async () => { const api = fakeApi(); created.push(api); return api })
  await manager.startAll()
  manager.stopAll()
  assert.ok(created.every((a) => a.listener.stopped))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd zalo-service && npm test`
Expected: FAIL — `Cannot find module '.../src/accounts.js'`

- [ ] **Step 3: Implement AccountManager**

`zalo-service/src/accounts.ts`:

```ts
import type { Logger } from './logger.js'

export interface ListenerLike {
  on(event: string, cb: (...args: any[]) => void): unknown
  start(opts?: { retryOnClose?: boolean }): void
  stop(): void
}

export interface ApiLike {
  listener: ListenerLike
  getOwnId(): string
  getGroupInfo(groupId: string): Promise<{ gridInfoMap?: Record<string, { name?: string }> }>
}

export interface Account {
  id: string
  credentials: unknown
}

export interface AccountState {
  id: string
  loggedIn: boolean
  connected: boolean
  lastError?: string
}

/**
 * Một tiến trình quản lý N tài khoản Zalo phụ (sơ đồ 6.4).
 * Một tài khoản lỗi (bị khoá, phiên hết hạn, listener đóng hẳn) KHÔNG làm dừng tài khoản khác;
 * tài khoản lỗi tự đăng nhập lại sau retryMs. Chỉ đọc: không gọi API ghi nào của Zalo.
 */
export class AccountManager {
  private readonly states = new Map<string, AccountState>()
  private readonly apis = new Map<string, ApiLike>()

  constructor(
    private readonly deps: {
      accounts: Account[]
      login: (credentials: unknown) => Promise<ApiLike>
      onMessage: (accountId: string, message: unknown) => void
      logger: Logger
      retryMs?: number
      schedule?: (fn: () => void, ms: number) => void
    },
  ) {}

  async startAll(): Promise<void> {
    await Promise.all(this.deps.accounts.map((account) => this.start(account)))
  }

  snapshot(): AccountState[] {
    return [...this.states.values()].map((state) => ({ ...state }))
  }

  anyApi(): ApiLike | undefined {
    for (const [id, api] of this.apis) {
      if (this.states.get(id)?.loggedIn) return api
    }
    return undefined
  }

  stopAll(): void {
    for (const api of this.apis.values()) api.listener.stop()
  }

  private async start(account: Account): Promise<void> {
    const state: AccountState = { id: account.id, loggedIn: false, connected: false }
    this.states.set(account.id, state)
    const log = this.deps.logger

    let api: ApiLike
    try {
      api = await this.deps.login(account.credentials)
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      log.error(`Tài khoản ${account.id}: đăng nhập lỗi (${state.lastError}) — thử lại sau`)
      this.retry(account)
      return
    }

    state.loggedIn = true
    this.apis.set(account.id, api)
    log.info(`Tài khoản ${account.id}: đăng nhập OK, uid ${api.getOwnId()}`)

    api.listener.on('connected', () => {
      state.connected = true
      log.info(`Tài khoản ${account.id}: listener đã kết nối`)
    })
    api.listener.on('disconnected', (code, reason) => {
      state.connected = false
      log.error(`Tài khoản ${account.id}: listener ngắt (${code} ${reason}), zca-js tự kết nối lại`)
    })
    api.listener.on('closed', (code, reason) => {
      state.connected = false
      state.loggedIn = false
      log.error(`Tài khoản ${account.id}: listener đóng hẳn (${code} ${reason}) — đăng nhập lại sau`)
      this.retry(account)
    })
    api.listener.on('error', (err) => log.error(`Tài khoản ${account.id}: listener lỗi`, err?.message ?? err))
    api.listener.on('message', (message) => this.deps.onMessage(account.id, message))
    api.listener.start({ retryOnClose: true })
  }

  private retry(account: Account): void {
    const schedule = this.deps.schedule ?? ((fn: () => void, ms: number) => { setTimeout(fn, ms) })
    schedule(() => { void this.start(account) }, this.deps.retryMs ?? 60_000)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd zalo-service && npm test`
Expected: PASS (`# fail 0`)

- [ ] **Step 5: Write the entry point, stats CLI and login script**

`zalo-service/src/index.ts`:

```ts
// Microservice Zalo (Cuốc Free) — giai đoạn 1: nghe tin từ N tài khoản phụ, LƯU NGAY vào SQLite,
// gửi heartbeat cho Laravel. CHỈ ĐỌC: không gọi bất kỳ API ghi nào của Zalo.
import { Zalo, type Credentials } from 'zca-js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { MessageStore } from './store.js'
import { GroupNames } from './groups.js'
import { createIngestor, newCounters } from './ingest.js'
import { AccountManager, type ApiLike } from './accounts.js'
import { buildHeartbeat } from './heartbeat.js'
import { createSender } from './http.js'
import { logger } from './logger.js'
import type { IncomingMessage } from './normalize.js'

const HOUR = 3_600_000
const cfg = loadConfig(process.env)

const accounts = existsSync(cfg.accountsDir)
  ? readdirSync(cfg.accountsDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        id: basename(file, '.json'),
        credentials: JSON.parse(readFileSync(join(cfg.accountsDir, file), 'utf8')) as unknown,
      }))
  : []
if (accounts.length === 0) {
  logger.error(`Chưa có tài khoản nào trong ${cfg.accountsDir} — chạy "npm run login -- <tên>" trên máy cá nhân rồi copy file lên`)
  process.exit(1)
}

const db = openDb(cfg.dbPath)
const store = new MessageStore(db, {
  duplicateWindowMs: cfg.duplicateWindowHours * HOUR,
  maxContentLength: cfg.maxContentLength,
  retentionMs: cfg.retentionDays * 24 * HOUR,
})
const counters = newCounters()

// manager được gán ngay bên dưới; fetchName chỉ chạy khi đã có tin, tức là sau khi đăng nhập.
let manager: AccountManager | undefined
const groups = new GroupNames({
  fetchName: async (groupId) => {
    const api = manager?.anyApi()
    if (!api) throw new Error('Chưa có tài khoản nào đăng nhập')
    return (await api.getGroupInfo(groupId)).gridInfoMap?.[groupId]?.name ?? ''
  },
})
const ingest = createIngestor({ store, groups, counters })

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
await manager.startAll()

const send = createSender({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const startedAt = Date.now()

setInterval(async () => {
  const payload = buildHeartbeat({ serviceId: cfg.serviceId, startedAt, now: Date.now(), counters, accounts: manager!.snapshot() })
  const { status } = await send('/api/internal/zalo/heartbeat', payload)
  if (status !== 200) logger.error('Heartbeat lỗi HTTP', status || 'mạng')
}, cfg.heartbeatMs)

setInterval(() => {
  const deleted = store.prune()
  if (deleted > 0) logger.info(`Đã xoá ${deleted} tin thô quá ${cfg.retentionDays} ngày`)
}, HOUR)

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`Nhận ${signal}, dừng service`)
    manager?.stopAll()
    db.close()
    process.exit(0)
  })
}
```

`zalo-service/src/cli/stats.ts`:

```ts
// Thống kê tin thô để chốt chi phí AI: npm run stats -- --hours=72
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { computeStats, formatStats } from '../stats.js'

const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 24
const db = new Database(join(process.env.DATA_DIR || './data', 'zalo.sqlite'), { readonly: true, fileMustExist: true })

console.log(formatStats(computeStats(db, hours), hours))
db.close()
```

`zalo-service/scripts/login.ts`:

```ts
// Chạy trên MÁY CÁ NHÂN (cần mở ảnh QR để quét), KHÔNG chạy trên VPS:
//   npm run login -- acc1
// Quét QR bằng tài khoản Zalo PHỤ → data/accounts/acc1.json → copy lên VPS.
import { Zalo, LoginQRCallbackEventType } from 'zca-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const id = process.argv[2]
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Cách dùng: npm run login -- <tên-tài-khoản> (chữ thường, số, gạch ngang)')
  process.exit(1)
}

const dataDir = process.env.DATA_DIR || './data'
const accountsDir = join(dataDir, 'accounts')
mkdirSync(accountsDir, { recursive: true })
const qrPath = join(dataDir, `login-qr-${id}.png`)

let credentials: unknown = null
await new Zalo({ selfListen: false, logging: false }).loginQR({ qrPath }, (event) => {
  if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
    writeFileSync(qrPath, Buffer.from(event.data.image, 'base64'))
    console.log('>> Quét QR bằng tài khoản Zalo PHỤ:', qrPath)
    try { execSync(`open "${qrPath}"`) } catch { /* không mở được thì tự mở file */ }
  } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
    console.log('>> QR hết hạn, tạo mới...')
    event.actions.retry()
  } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
    credentials = event.data
  }
})

if (!credentials) {
  console.error('!! Đăng nhập xong nhưng không nhận được phiên — thử lại')
  process.exit(1)
}
const out = join(accountsDir, `${id}.json`)
writeFileSync(out, JSON.stringify(credentials), { mode: 0o600 })
console.log('>> Đã lưu phiên:', out, '— copy lên VPS (xem README)')
process.exit(0)
```

- [ ] **Step 6: Typecheck, build, test**

Run: `cd zalo-service && npm run typecheck && npm run build && npm test`
Expected: không lỗi kiểu; có `dist/src/index.js`, `dist/src/cli/stats.js`; test PASS (`# fail 0`)

Nếu `npm run typecheck` báo kiểu sự kiện của `loginQR` không khớp (`event.data.image`, `event.actions.retry`), đối chiếu với `node_modules/zca-js/dist/apis/loginQR.d.ts` (union `LoginQRCallbackEvent`) và sửa cách thu hẹp kiểu theo `event.type` — không đổi hành vi.

- [ ] **Step 7: Commit**

```bash
git add zalo-service/src/accounts.ts zalo-service/src/index.ts zalo-service/src/cli/stats.ts zalo-service/scripts/login.ts zalo-service/test/accounts.test.ts
git commit -m "feat(zalo-service): quản lý N tài khoản tự đăng nhập lại, điểm khởi chạy, lệnh thống kê, đăng nhập QR"
```

---

### Task 7: Triển khai — systemd, README, runbook, chạy thử trên máy dev

**Files:**
- Create: `zalo-service/deploy/greenca-zalo-service.service`
- Create: `zalo-service/README.md`
- Modify: `docs/DEPLOY.md` (thêm mục "Microservice Zalo — Cuốc Free" ngay trước dòng `## Lịch sử production`)

**Interfaces:**
- Consumes: `npm run build`, `npm start`, `npm run login`, `npm run stats` (Task 6); `zalo:service-status`, healthcheck #5 (Task 2).

- [ ] **Step 1: Write the systemd unit**

`zalo-service/deploy/greenca-zalo-service.service`:

```ini
[Unit]
Description=GreenCA microservice Zalo (Cuốc Free) — nghe tin nhóm, chỉ đọc
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=zalobot
WorkingDirectory=/opt/greenca-zalo-service
EnvironmentFile=/opt/greenca-zalo-service/.env
ExecStart=/usr/bin/node dist/src/index.js
# Tài khoản lỗi tự đăng nhập lại bên trong tiến trình; systemd chỉ lo khi cả tiến trình chết.
Restart=always
RestartSec=5
StandardOutput=append:/var/log/greenca-zalo-service.log
StandardError=append:/var/log/greenca-zalo-service.log

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the README**

`zalo-service/README.md`:

````markdown
# GreenCA microservice Zalo (Cuốc Free)

Service **chỉ đọc** (TypeScript, SQLite): dùng N tài khoản Zalo phụ (thư viện không chính thức
`zca-js`) nghe tin mới trong các nhóm bắn cuốc, **lưu ngay** vào `data/zalo.sqlite` (bỏ tin trùng),
gửi heartbeat cho Laravel. Không gửi tin, không kết bạn. Giai đoạn 1 chưa tách cuốc, chưa gọi AI.
Spec: `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md`.

## Phát triển

```bash
npm install
npm test
npm run typecheck
```

## Đăng nhập tài khoản phụ (trên máy cá nhân)

```bash
npm install
npm run login -- acc1        # mở ảnh QR → quét bằng tài khoản Zalo PHỤ số 1
npm run login -- acc2        # tài khoản phụ số 2 ...
# → data/accounts/acc1.json, acc2.json (chmod 600) — phiên đăng nhập, giữ bí mật như mật khẩu
```

## Cài lên VPS (Ubuntu, Node 20)

```bash
sudo useradd --system --home /opt/greenca-zalo-service --shell /usr/sbin/nologin zalobot
sudo mkdir -p /opt/greenca-zalo-service/data/accounts
# copy mã nguồn (trừ node_modules, dist, data) lên /opt/greenca-zalo-service, rồi:
cd /opt/greenca-zalo-service && sudo npm ci && sudo npm run build
scp data/accounts/*.json <vps>:/opt/greenca-zalo-service/data/accounts/
sudo cp .env.example .env && sudo nano .env           # API_BASE_URL, BOT_SECRET, SERVICE_ID, DATA_DIR
sudo chown -R zalobot:zalobot /opt/greenca-zalo-service
sudo chmod 600 /opt/greenca-zalo-service/.env /opt/greenca-zalo-service/data/accounts/*.json
sudo timedatectl set-ntp true                         # lệch giờ > 5 phút → Laravel trả 401
sudo cp deploy/greenca-zalo-service.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now greenca-zalo-service
tail -f /var/log/greenca-zalo-service.log             # phải thấy "đăng nhập OK" và "listener đã kết nối" cho từng tài khoản
```

VPS **không cần mở cổng nào** — mọi kết nối đi ra (tới Zalo và Laravel).

## Thống kê (chốt chi phí AI sau 2–3 ngày)

```bash
sudo -u zalobot env DATA_DIR=/opt/greenca-zalo-service/data npm run stats -- --hours=72
```

## Khi một tài khoản bị khoá / phiên hết hạn

Log lặp lại `Tài khoản accX: đăng nhập lỗi` mỗi 60 giây, Telegram báo "tài khoản mất kết nối: accX";
các tài khoản khác vẫn chạy. Chạy lại `npm run login -- accX` trên máy cá nhân (hoặc thay bằng tài
khoản phụ mới), copy file lên VPS, `sudo systemctl restart greenca-zalo-service`.
````

- [ ] **Step 3: Add the runbook section to `docs/DEPLOY.md`**

Thêm ngay trước dòng `## Lịch sử production`:

````markdown
## Microservice Zalo — Cuốc Free (giai đoạn 1: thu tin thô)

Service Node chạy trên **VPS riêng** (không chạy trên server production), hướng dẫn cài ở
`zalo-service/README.md`. Tin thô nằm trong SQLite của service — production không nhận tin thô.
Phía Laravel production chỉ cần:

```bash
# backend/.env
ZALO_SERVICE_ENABLED=true
ZALO_BOT_SECRET=<chuỗi ngẫu nhiên, trùng BOT_SECRET của service>   # tạo bằng: openssl rand -hex 32

php artisan config:cache
chown -R www-data:www-data storage bootstrap/cache
```

- Giám sát: `deploy/monitoring/greenca-healthcheck.sh` có kiểm tra #5 (`zalo:service-status`) —
  copy bản mới lên `/usr/local/bin/greenca-healthcheck.sh`. Chỉ chạy khi `ZALO_SERVICE_ENABLED=true`.
- Tắt khẩn cấp phía Laravel: `ZALO_SERVICE_ENABLED=false` + `php artisan config:cache` → endpoint trả 503
  (service vẫn nghe và lưu tin bình thường, chỉ heartbeat bị từ chối).
- Số liệu chốt chi phí AI: chạy `npm run stats -- --hours=72` **trên VPS service** (xem README).
````

- [ ] **Step 4: Smoke test on the dev machine**

Cần Docker đang chạy và ít nhất một tài khoản Zalo phụ đã ở trong một nhóm có tin.

```bash
# backend/.env local: ZALO_SERVICE_ENABLED=true, ZALO_BOT_SECRET=dev-secret
docker compose exec -T app php artisan config:clear

cd zalo-service
npm run login -- acc1
API_BASE_URL=http://localhost:8080 BOT_SECRET=dev-secret SERVICE_ID=zalo-dev HEARTBEAT_MS=10000 npm run dev
```

Expected (trong 1–2 phút, khi nhóm có tin mới):
- Log: `Tài khoản acc1: đăng nhập OK`, `Tài khoản acc1: listener đã kết nối`, không có `Heartbeat lỗi HTTP`.
- Terminal khác: `cd zalo-service && npm run build && npm run stats -- --hours=1` → `Tổng tin` > 0 và tên nhóm thật.
- `docker compose exec -T app php artisan zalo:service-status` → `zalo-dev: OK (1 tài khoản, ...)`, exit 0.
- Ctrl+C → log `Nhận SIGINT, dừng service`; chạy lại `npm run dev` → tin cũ vẫn còn trong thống kê (đã lưu ngay khi nhận).

- [ ] **Step 5: Commit**

```bash
git add zalo-service/deploy/greenca-zalo-service.service zalo-service/README.md docs/DEPLOY.md
git commit -m "docs(zalo-service): unit systemd, hướng dẫn cài VPS, runbook production"
```
