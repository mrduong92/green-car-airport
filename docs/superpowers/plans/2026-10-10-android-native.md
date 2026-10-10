# Bản Android native (khách hàng + tài xế) có push FCM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hai app Android đã ký (GreenCA `vn.greenca.customer`, GreenCA Tài Xế `vn.greenca.driver`) chạy toàn bộ tính năng PWA, có push FCM với âm báo "Green CA, Green CA" cho cuốc mới, trỏ về staging; ra APK + AAB cùng chữ ký.

**Architecture:** Capacitor 8 bọc bundle web build ở mode Vite `native`. Mọi chỗ chạm API hệ điều hành nằm sau facade (`src/platform.ts`, `src/push/`, `src/share.ts`, `src/webOrigin.ts`). Backend thay `WebPushChannel` bằng `PushChannel` chia token cho `WebPushTransport` / `FcmTransport`; `FcmTransport` dịch payload trung tính (`toPush`) sang message FCM HTTP v1 và gửi qua interface `FcmSender` (adapter `kreait/firebase-php`).

**Tech Stack:** Laravel 13 / PHP 8.4, `kreait/firebase-php`, React 19 + Vite 8, Capacitor 8 (`@capacitor/app`, `push-notifications`, `share`, `status-bar`, `splash-screen`, `assets`), Gradle + JDK 21, Google Cloud Text-to-Speech.

**Spec:** `docs/superpowers/specs/2026-10-10-android-native-design.md` (đọc kèm; spec gốc toàn dự án: `docs/superpowers/specs/2026-08-02-mobile-native-apps-design.md` — có sau Task 1).

**Làm việc ở:** worktree `.claude/worktrees/android-native`, nhánh `feat/android-native`. **Không** `cd` về repo chính — repo chính đang có việc dở của nhánh khác.

## Lệch có chủ ý so với spec (đã cân nhắc khi lập plan)

| Spec | Plan | Lý do |
|---|---|---|
| `kreait/laravel-firebase` | `kreait/firebase-php` + binding tự viết trong `AppServiceProvider` | Chỉ cần Messaging; tránh phụ thuộc gói bridge theo phiên bản Laravel 13. Hành vi y hệt |
| `VITE_API_BASE_URL` khác nhau theo app | Một giá trị `https://webco.io.vn` cho cả hai | Cùng một backend; host Reverb suy từ chính URL này. Link giới thiệu của tài xế dùng `VITE_DRIVER_APP_URL` có sẵn |
| `.env.native` commit | `.env.native` **gitignore**, giống `.env.staging` / `.env.production` | Theo quy ước repo; nội dung ghi trong `docs/MOBILE.md` |
| Build web trong container `frontend` | Build web trên **host** (Node 22) | Container `frontend` mount repo chính, không phải worktree — build trong đó sẽ ra bundle của nhánh khác |
| Âm báo `.ogg` Vorbis | `.mp3` | Google TTS không xuất Vorbis; Opus-in-Ogg chỉ chạy từ Android 10 (minSdk 24). MP3 chạy mọi nơi kể cả WebView, không cần ffmpeg |
| Có `FreeRideMatchNotification` | Không có trên `origin/main` | PR #13 (Cuốc Free) chưa merge. Xử lý ở Task 17 |

## Global Constraints

- appId: `vn.greenca.customer`, `vn.greenca.driver` — không đổi được sau phát hành.
- Tên app: `GreenCA`, `GreenCA Tài Xế` — lấy từ `BRAND` trong `frontend/src/brand.ts`, không hardcode tên ở chỗ khác.
- WebView hostname: `app.greenca.vn` (khách), `driver-app.greenca.vn` (tài xế); `androidScheme: 'https'`.
- Capacitor 8; minSdk 24, compileSdk 36, targetSdk 36. Plugin `@capacitor/*` cùng **phiên bản chính xác** ở `frontend/package.json` và `mobile/<app>/package.json`.
- Kênh Android: `new_ride` (tên hiển thị "Cuốc mới", importance 5, sound `new_ride`) và `general` ("Thông báo chung", importance 4). `NewBookingAvailableNotification` dùng `new_ride` + `ttl` 300.
- Phiên bản: `mobile/<app>/package.json` `version`, bắt đầu `1.0.0`; `versionCode = major*10000 + minor*100 + patch`.
- Keystore: `~/.greenca/greenca-release.jks`, alias `greenca`, RSA 4096, 10950 ngày; mật khẩu trong `mobile/keystore.properties` (gitignore). **Không bao giờ commit keystore, mật khẩu, service account JSON.**
- `google-services.json` đặt ở `mobile/<app>/android/app/` và **được** commit.
- Toàn bộ chuỗi UI tiếng Việt. Không dịch chuỗi tiếng Việt có sẵn.
- Web PWA không đổi hành vi: bản build production/staging vẫn bắt `VITE_VAPID_PUBLIC_KEY`.
- Endpoint `device-token` tương thích ngược với payload `subscription` của bản web đang chạy.
- Buộc cập nhật: fail-open — lỗi mạng / server / dữ liệu sai thì cho vào app.
- Commit message tiếng Việt theo quy ước repo (`feat(mobile): …`, `fix(backend): …`), kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Lệnh dùng chung trong worktree

```bash
WT=/Users/macbook/Projects/green-car-airport/.claude/worktrees/android-native
# Backend (sqlite :memory: theo phpunit.xml — không đụng MySQL / container đang chạy):
BE="docker run --rm -v $WT/backend:/var/www/html -w /var/www/html green-car-airport_app:latest"
$BE php artisan test --filter=TenTest
# Frontend: chạy trên host, Node 22, trong $WT/frontend
```

## Review Focus

1. **`data` FCM có giá trị `null`** (ví dụ `booking_id` null ở thông báo nạp điểm) → FCM từ chối cả message nếu giá trị không phải chuỗi; phải bỏ khoá null, không gửi chuỗi `"null"`. Test ở Task 4.
2. **Admin đặt `min_supported` lớn hơn `latest`** hoặc chuỗi không phải `x.y.z` → toàn bộ người dùng bị khoá ở màn cập nhật. Phải trả 422. Test ở Task 6.
3. **So sánh phiên bản dạng số và dữ liệu sai** (`1.10.0` > `1.9.0`; server trả `""`, `"1.0"`) → so chuỗi sẽ sai; dữ liệu sai phải fail-open. Test ở Task 11.
4. **Cùng một FCM token đăng ký bởi user khác** (đăng xuất rồi đăng nhập tài khoản khác trên cùng máy) → token chuyển chủ; user A không xoá được token của user B. Test ở Task 2.
5. **`open_url` trỏ ra ngoài** (`//evil.com`, `https://evil.com`) khi chạm thông báo → phải về `/`, không điều hướng WebView ra domain lạ. Test ở Task 8.

---

### Task 0: Chuẩn bị worktree

**Files:** không sửa file tracked.

- [ ] **Step 1: Chép env frontend từ repo chính** (file không tracked, worktree mới không có)

```bash
cd $WT/frontend
cp ../../../../frontend/.env .env
cp ../../../../frontend/.env.staging .env.staging
grep -c "e2e-test-placeholder" .env || true   # phải in 0
```

- [ ] **Step 2: Cài phụ thuộc**

```bash
cd $WT/frontend && npm ci
cp ../../../../backend/.env $WT/backend/.env 2>/dev/null || cp $WT/backend/.env.example $WT/backend/.env
$BE composer install --no-interaction
```

- [ ] **Step 3: Baseline xanh**

```bash
$BE php artisan test
cd $WT/frontend && npm run build:customer -- --mode staging && npm run build:driver -- --mode staging
```
Expected: test PASS toàn bộ; 2 build thành công. Ghi lại số test pass để so ở Task 16.

---

### Task 1: Cherry-pick POC Capacitor

**Files:**
- Cherry-pick: `0632d1e`, `b523a90`, `ae5556c`, `f1c331f` từ `poc/capacitor-android`
- Tạo/sửa: `frontend/src/api/base.ts`, `frontend/src/api/axios.ts`, `frontend/src/echo.ts`, `mobile/customer/**`, `docs/MOBILE.md`, `docs/superpowers/specs/2026-08-02-mobile-native-apps-design.md`

**Interfaces:**
- Produces: `API_BASE: string` từ `@/api/base` (rỗng ở bản web). `mobile/customer/` là project Capacitor + Android đã chạy được.

- [ ] **Step 1: Cherry-pick theo thứ tự**

```bash
cd $WT && git cherry-pick 0632d1e b523a90 ae5556c f1c331f
```
Nếu xung đột ở `axios.ts` / `echo.ts`: giữ toàn bộ thay đổi của `origin/main`, chỉ thêm `import { API_BASE }` và đổi `baseURL: '/api'` → `` `${API_BASE}/api` `` (axios) cùng khối `apiBaseUrl` + `authEndpoint` tuyệt đối (echo) đúng như diff POC. `git cherry-pick --continue`.

- [ ] **Step 2: Bản web không đổi hành vi**

```bash
cd $WT/frontend && npm run build:customer -- --mode staging
grep -o 'baseURL:"[^"]*"' dist/assets/*.js | head -1
```
Expected: build OK; `baseURL:"/api"` (API_BASE rỗng).

- [ ] **Step 3: Kiểm lịch sử**

Run: `git log --oneline origin/main..HEAD`
Expected: 6 commit (spec + plan + 4 cherry-pick). Không cần commit thêm.

---

### Task 2: `device_tokens` nhận FCM token

**Files:**
- Create: `backend/database/migrations/2026_10_10_000001_add_fcm_token_to_device_tokens_table.php`
- Modify: `backend/app/Models/DeviceToken.php`, `backend/app/Http/Controllers/DeviceTokenController.php`
- Test: `backend/tests/Feature/DeviceTokenTest.php`

**Interfaces:**
- Produces: cột `device_tokens.fcm_token` (nullable, unique); `endpoint`/`p256dh`/`auth` nullable. API: `POST /api/device-token {fcm_token, platform: 'android'|'ios'}` hoặc `{subscription, platform?}`; `DELETE /api/device-token {fcm_token}` hoặc `{endpoint}`.

- [ ] **Step 1: Viết test fail**

```php
<?php
// backend/tests/Feature/DeviceTokenTest.php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_push_dang_cu_van_dang_ky_duoc(): void
    {
        $user = User::factory()->create(['role' => 'driver']);

        $this->actingAs($user, 'sanctum')->postJson('/api/device-token', [
            'subscription' => ['endpoint' => 'https://push.example/abc', 'keys' => ['p256dh' => 'p', 'auth' => 'a']],
        ])->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'user_id' => $user->id, 'endpoint' => 'https://push.example/abc', 'platform' => 'web', 'fcm_token' => null,
        ]);
    }

    public function test_dang_ky_fcm_token(): void
    {
        $user = User::factory()->create(['role' => 'driver']);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'fcm-1', 'platform' => 'android'])
            ->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'user_id' => $user->id, 'fcm_token' => 'fcm-1', 'platform' => 'android', 'endpoint' => null,
        ]);
    }

    public function test_cung_token_user_khac_dang_ky_thi_chuyen_chu(): void
    {
        $a = User::factory()->create(['role' => 'driver']);
        $b = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $a->id, 'fcm_token' => 'fcm-shared', 'platform' => 'android']);

        $this->actingAs($b, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'fcm-shared', 'platform' => 'android'])
            ->assertOk();

        $this->assertSame(1, DeviceToken::where('fcm_token', 'fcm-shared')->count());
        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 'fcm-shared', 'user_id' => $b->id]);
    }

    public function test_thieu_ca_hai_dang_thi_422(): void
    {
        $user = User::factory()->create(['role' => 'customer']);

        $this->actingAs($user, 'sanctum')->postJson('/api/device-token', [])->assertStatus(422);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/device-token', ['fcm_token' => 'x', 'platform' => 'web'])
            ->assertStatus(422);
    }

    public function test_xoa_theo_fcm_token_chi_xoa_cua_minh(): void
    {
        $a = User::factory()->create(['role' => 'driver']);
        $b = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $a->id, 'fcm_token' => 'fcm-a', 'platform' => 'android']);

        $this->actingAs($b, 'sanctum')
            ->deleteJson('/api/device-token', ['fcm_token' => 'fcm-a'])
            ->assertOk();
        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 'fcm-a']);

        $this->actingAs($a, 'sanctum')
            ->deleteJson('/api/device-token', ['fcm_token' => 'fcm-a'])
            ->assertOk();
        $this->assertDatabaseMissing('device_tokens', ['fcm_token' => 'fcm-a']);
    }

    public function test_xoa_theo_endpoint_van_chay(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/x', 'p256dh' => 'p', 'auth' => 'a']);

        $this->actingAs($user, 'sanctum')
            ->deleteJson('/api/device-token', ['endpoint' => 'https://push.example/x'])
            ->assertOk();

        $this->assertDatabaseMissing('device_tokens', ['endpoint' => 'https://push.example/x']);
    }
}
```

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `$BE php artisan test --filter=DeviceTokenTest`
Expected: FAIL — cột `fcm_token` không tồn tại.

- [ ] **Step 3: Migration**

```php
<?php
// backend/database/migrations/2026_10_10_000001_add_fcm_token_to_device_tokens_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Mỗi dòng device_tokens giờ là MỘT trong hai loại: Web Push (endpoint + khoá)
 * hoặc FCM (fcm_token) của app native. Ba cột Web Push phải nullable vì dòng
 * FCM không có chúng.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('device_tokens', function (Blueprint $table) {
            $table->string('fcm_token', 255)->nullable()->unique()->after('user_id');
            $table->string('endpoint', 500)->nullable()->change();
            $table->string('p256dh', 500)->nullable()->change();
            $table->string('auth', 100)->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('device_tokens')->whereNotNull('fcm_token')->delete();

        Schema::table('device_tokens', function (Blueprint $table) {
            $table->dropUnique(['fcm_token']);
            $table->dropColumn('fcm_token');
            $table->string('endpoint', 500)->nullable(false)->change();
            $table->string('p256dh', 500)->nullable(false)->change();
            $table->string('auth', 100)->nullable(false)->change();
        });
    }
};
```

- [ ] **Step 4: Model**

```php
// backend/app/Models/DeviceToken.php — thay $fillable
protected $fillable = ['user_id', 'fcm_token', 'endpoint', 'p256dh', 'auth', 'platform', 'last_used_at'];
```

- [ ] **Step 5: Controller**

```php
<?php
namespace App\Http\Controllers;

use App\Models\DeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceTokenController extends Controller
{
    /**
     * Hai dạng payload:
     * - `fcm_token` + `platform` — app native (FCM).
     * - `subscription` — Web Push. GIỮ NGUYÊN: bản web đang chạy ngoài kia vẫn gửi dạng này.
     */
    public function store(Request $request): JsonResponse
    {
        if ($request->has('fcm_token')) {
            $data = $request->validate([
                'fcm_token' => 'required|string|max:255',
                'platform' => 'required|in:android,ios',
            ]);

            // Theo token chứ không theo user: cùng một máy đăng nhập tài khoản
            // khác thì token phải chuyển sang người mới, không bắn nhầm người cũ.
            DeviceToken::updateOrCreate(
                ['fcm_token' => $data['fcm_token']],
                ['user_id' => $request->user()->id, 'platform' => $data['platform'], 'last_used_at' => now()],
            );

            return response()->json(['ok' => true]);
        }

        $request->validate([
            'subscription.endpoint' => 'required|string',
            'subscription.keys.p256dh' => 'required|string',
            'subscription.keys.auth' => 'required|string',
        ]);

        $sub = $request->input('subscription');

        DeviceToken::updateOrCreate(
            ['endpoint' => $sub['endpoint']],
            [
                'user_id'      => $request->user()->id,
                'p256dh'       => $sub['keys']['p256dh'],
                'auth'         => $sub['keys']['auth'],
                'platform'     => $request->input('platform', 'web'),
                'last_used_at' => now(),
            ]
        );

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->validate([
            'fcm_token' => 'required_without:endpoint|string',
            'endpoint' => 'required_without:fcm_token|string',
        ]);

        $query = DeviceToken::where('user_id', $request->user()->id);

        $request->filled('fcm_token')
            ? $query->where('fcm_token', $request->input('fcm_token'))
            : $query->where('endpoint', $request->input('endpoint'));

        $query->delete();

        return response()->json(['ok' => true]);
    }
}
```

- [ ] **Step 6: Chạy test**

Run: `$BE php artisan test --filter=DeviceTokenTest`
Expected: PASS 6/6.

- [ ] **Step 7: Commit**

```bash
git add backend/database/migrations/2026_10_10_000001_add_fcm_token_to_device_tokens_table.php backend/app/Models/DeviceToken.php backend/app/Http/Controllers/DeviceTokenController.php backend/tests/Feature/DeviceTokenTest.php
git commit -m "feat(backend): device_tokens nhận FCM token cho app native, giữ tương thích Web Push

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `FcmSender` — adapter gửi FCM

**Files:**
- Create: `backend/app/Services/Fcm/FcmSender.php`, `FcmSendResult.php`, `KreaitFcmSender.php`, `NullFcmSender.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`, `backend/config/services.php`, `backend/.env.example`, `backend/composer.json`, `backend/composer.lock`
- Test: `backend/tests/Feature/FcmSenderBindingTest.php`

**Interfaces:**
- Produces:
  - `interface FcmSender { public function send(array $tokens, array $message): FcmSendResult; }` — `$tokens`: `list<string>`; `$message`: mảng theo định dạng message FCM HTTP v1, **không** có khoá `token`.
  - `final class FcmSendResult { public readonly array $delivered; public readonly array $invalid; }` — `list<string>` token gửi thành công / token chết cần xoá.
  - Container: `app(FcmSender::class)` → `NullFcmSender` khi `config('services.firebase.credentials')` trống, ngược lại `KreaitFcmSender`.

- [ ] **Step 1: Cài thư viện**

```bash
$BE composer require kreait/firebase-php --no-interaction
```
Expected: cài được bản mới nhất tương thích PHP 8.4. Ghi phiên bản vào commit message.

- [ ] **Step 2: Viết test fail**

```php
<?php
// backend/tests/Feature/FcmSenderBindingTest.php

namespace Tests\Feature;

use App\Services\Fcm\FcmSender;
use App\Services\Fcm\NullFcmSender;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class FcmSenderBindingTest extends TestCase
{
    public function test_chua_cau_hinh_firebase_thi_dung_null_sender(): void
    {
        config(['services.firebase.credentials' => null]);

        $this->assertInstanceOf(NullFcmSender::class, app(FcmSender::class));
    }

    public function test_null_sender_khong_gui_khong_xoa_token_va_co_log(): void
    {
        Log::spy();

        $result = (new NullFcmSender())->send(['t1', 't2'], ['notification' => ['title' => 'x']]);

        $this->assertSame([], $result->delivered);
        $this->assertSame([], $result->invalid);
        Log::shouldHaveReceived('warning')->once();
    }
}
```

- [ ] **Step 3: Chạy, xác nhận fail**

Run: `$BE php artisan test --filter=FcmSenderBindingTest`
Expected: FAIL — class `App\Services\Fcm\FcmSender` không tồn tại.

- [ ] **Step 4: Viết các class**

```php
<?php
// backend/app/Services/Fcm/FcmSender.php
namespace App\Services\Fcm;

/**
 * Ranh giới với Firebase. FcmTransport chỉ biết interface này nên test được mà
 * không cần Firebase thật; đổi thư viện gửi chỉ phải viết lại một adapter.
 */
interface FcmSender
{
    /**
     * @param  list<string>  $tokens
     * @param  array<string, mixed>  $message  message FCM HTTP v1, không có khoá `token`
     */
    public function send(array $tokens, array $message): FcmSendResult;
}
```

```php
<?php
// backend/app/Services/Fcm/FcmSendResult.php
namespace App\Services\Fcm;

final class FcmSendResult
{
    /**
     * @param  list<string>  $delivered  token gửi thành công
     * @param  list<string>  $invalid    token FCM báo không còn hợp lệ — cần xoá
     */
    public function __construct(
        public readonly array $delivered = [],
        public readonly array $invalid = [],
    ) {}
}
```

```php
<?php
// backend/app/Services/Fcm/NullFcmSender.php
namespace App\Services\Fcm;

use Illuminate\Support\Facades\Log;

/**
 * Dùng khi server chưa có FIREBASE_CREDENTIALS (vd staging chưa đặt file).
 * Không ném lỗi để Web Push vẫn chạy; KHÔNG báo token chết để khỏi xoá oan.
 */
final class NullFcmSender implements FcmSender
{
    public function send(array $tokens, array $message): FcmSendResult
    {
        Log::warning('[FCM] Chưa cấu hình FIREBASE_CREDENTIALS — bỏ qua '.count($tokens).' token app native');

        return new FcmSendResult();
    }
}
```

```php
<?php
// backend/app/Services/Fcm/KreaitFcmSender.php
namespace App\Services\Fcm;

use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Messaging\CloudMessage;

final class KreaitFcmSender implements FcmSender
{
    /** Giới hạn của FCM cho một lần multicast. */
    private const BATCH = 500;

    public function __construct(private Messaging $messaging) {}

    public function send(array $tokens, array $message): FcmSendResult
    {
        $delivered = [];
        $invalid = [];

        foreach (array_chunk($tokens, self::BATCH) as $chunk) {
            $report = $this->messaging->sendMulticast(CloudMessage::fromArray($message), $chunk);

            foreach ($report->successes()->getItems() as $item) {
                $delivered[] = $item->target()->value();
            }
            $invalid = [...$invalid, ...$report->invalidTokens(), ...$report->unknownTokens()];
        }

        return new FcmSendResult($delivered, array_values(array_unique($invalid)));
    }
}
```
Nếu phiên bản kreait cài được có tên method khác (`successes()`, `invalidTokens()`, `unknownTokens()`), đọc `vendor/kreait/firebase-php/src/Firebase/Messaging/MulticastSendReport.php` và đổi theo — giữ nguyên ngữ nghĩa delivered/invalid.

- [ ] **Step 5: Config + binding**

`backend/config/services.php` — thêm vào mảng trả về:
```php
    // Đường dẫn TUYỆT ĐỐI tới file service account JSON của Firebase, đặt NGOÀI git.
    // Trống → app native không nhận push (NullFcmSender), Web Push không ảnh hưởng.
    'firebase' => [
        'credentials' => env('FIREBASE_CREDENTIALS'),
    ],
```

`backend/.env.example` — thêm dưới khối `VAPID_*`:
```
# Push FCM cho app native: đường dẫn tuyệt đối tới service account JSON (không commit file này)
FIREBASE_CREDENTIALS=
```

`backend/app/Providers/AppServiceProvider.php` — trong `register()`, sau binding `ZnsSender`:
```php
        $this->app->singleton(FcmSender::class, function () {
            $credentials = config('services.firebase.credentials');

            if (blank($credentials)) {
                return new NullFcmSender();
            }

            return new KreaitFcmSender(
                (new \Kreait\Firebase\Factory())->withServiceAccount($credentials)->createMessaging()
            );
        });
```
và thêm `use App\Services\Fcm\FcmSender; use App\Services\Fcm\KreaitFcmSender; use App\Services\Fcm\NullFcmSender;`.

- [ ] **Step 6: Chạy test**

Run: `$BE php artisan test --filter=FcmSenderBindingTest`
Expected: PASS 2/2.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/Fcm backend/app/Providers/AppServiceProvider.php backend/config/services.php backend/.env.example backend/composer.json backend/composer.lock backend/tests/Feature/FcmSenderBindingTest.php
git commit -m "feat(backend): adapter FcmSender gửi FCM qua kreait, tự tắt khi chưa cấu hình Firebase

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `PushChannel` + hai transport

**Files:**
- Create: `backend/app/Channels/PushChannel.php`, `backend/app/Channels/Push/WebPushTransport.php`, `backend/app/Channels/Push/FcmTransport.php`
- Test: `backend/tests/Feature/FcmTransportTest.php`, `backend/tests/Feature/PushChannelTest.php`

(`WebPushChannel.php` chưa xoá ở task này — Task 5 chuyển notification rồi mới xoá.)

**Interfaces:**
- Consumes: `FcmSender`, `FcmSendResult` (Task 3); cột `fcm_token` (Task 2).
- Produces:
  - `PushChannel::send($notifiable, $notification): void` — gọi `$notification->toPush($notifiable, $notification)`.
  - `WebPushTransport::send(Collection $tokens, array $payload): void`
  - `FcmTransport::send(Collection $tokens, array $payload): void`
  - `FcmTransport::buildMessage(array $payload): array` (static, public — để test).
  - Payload `toPush`: `title`, `body`, `data` (mảng), tuỳ chọn `tag`, `channel` (`'new_ride'|'general'`), `ttl` (int giây).

- [ ] **Step 1: Test `FcmTransport` (fail)**

```php
<?php
// backend/tests/Feature/FcmTransportTest.php

namespace Tests\Feature;

use App\Channels\Push\FcmTransport;
use App\Models\DeviceToken;
use App\Models\User;
use App\Services\Fcm\FcmSender;
use App\Services\Fcm\FcmSendResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FcmTransportTest extends TestCase
{
    use RefreshDatabase;

    public function test_dich_payload_kenh_cuoc_moi(): void
    {
        $msg = FcmTransport::buildMessage([
            'title' => 'Có cuốc mới!',
            'body' => 'A → B',
            'data' => ['action' => 'view_trip', 'booking_id' => 42],
            'tag' => 'greenca-free-ride',
            'channel' => 'new_ride',
            'ttl' => 300,
        ]);

        $this->assertSame(['title' => 'Có cuốc mới!', 'body' => 'A → B'], $msg['notification']);
        $this->assertSame(['action' => 'view_trip', 'booking_id' => '42', 'channel' => 'new_ride'], $msg['data']);
        $this->assertSame('high', $msg['android']['priority']);
        $this->assertSame('300s', $msg['android']['ttl']);
        $this->assertSame('new_ride', $msg['android']['notification']['channel_id']);
        $this->assertSame('new_ride', $msg['android']['notification']['sound']);
        $this->assertSame('greenca-free-ride', $msg['android']['notification']['tag']);
    }

    public function test_mac_dinh_kenh_general_khong_ttl_khong_tag(): void
    {
        $msg = FcmTransport::buildMessage(['title' => 'T', 'body' => 'B', 'data' => ['action' => 'view_wallet']]);

        $this->assertSame('general', $msg['android']['notification']['channel_id']);
        $this->assertSame('default', $msg['android']['notification']['sound']);
        $this->assertArrayNotHasKey('tag', $msg['android']['notification']);
        $this->assertArrayNotHasKey('ttl', $msg['android']);
        $this->assertSame('general', $msg['data']['channel']);
    }

    public function test_data_null_bi_bo_va_moi_gia_tri_la_chuoi(): void
    {
        $msg = FcmTransport::buildMessage([
            'title' => 'T', 'body' => 'B',
            'data' => ['action' => 'view_wallet', 'booking_id' => null, 'amount' => 50, 'paid' => true],
        ]);

        $this->assertArrayNotHasKey('booking_id', $msg['data']);
        foreach ($msg['data'] as $value) {
            $this->assertIsString($value);
        }
        $this->assertSame('50', $msg['data']['amount']);
    }

    public function test_xoa_token_chet_cap_nhat_token_song(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'alive', 'platform' => 'android']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'dead', 'platform' => 'android']);

        $sender = new class implements FcmSender {
            public array $calls = [];
            public function send(array $tokens, array $message): FcmSendResult
            {
                $this->calls[] = $tokens;
                return new FcmSendResult(delivered: ['alive'], invalid: ['dead']);
            }
        };

        (new FcmTransport($sender))->send(DeviceToken::all(), ['title' => 'T', 'body' => 'B', 'data' => []]);

        $this->assertSame([['alive', 'dead']], $sender->calls);
        $this->assertDatabaseMissing('device_tokens', ['fcm_token' => 'dead']);
        $this->assertNotNull(DeviceToken::where('fcm_token', 'alive')->value('last_used_at'));
    }

    public function test_sender_nem_loi_thi_nuot_va_khong_xoa_gi(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 't', 'platform' => 'android']);

        $sender = new class implements FcmSender {
            public function send(array $tokens, array $message): FcmSendResult
            {
                throw new \RuntimeException('FCM down');
            }
        };

        (new FcmTransport($sender))->send(DeviceToken::all(), ['title' => 'T', 'body' => 'B', 'data' => []]);

        $this->assertDatabaseHas('device_tokens', ['fcm_token' => 't']);
    }
}
```

- [ ] **Step 2: Test `PushChannel` (fail)**

```php
<?php
// backend/tests/Feature/PushChannelTest.php

namespace Tests\Feature;

use App\Channels\Push\FcmTransport;
use App\Channels\Push\WebPushTransport;
use App\Channels\PushChannel;
use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;
use Mockery;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class PushChannelTest extends TestCase
{
    use RefreshDatabase;

    private function notification(): Notification
    {
        return new class extends Notification {
            public function via($notifiable): array { return [PushChannel::class]; }
            public function toPush($notifiable, $notification): array
            {
                return ['title' => 'T', 'body' => 'B', 'data' => ['action' => 'view_wallet']];
            }
        };
    }

    public function test_chia_token_cho_dung_transport(): void
    {
        $user = User::factory()->create(['role' => 'driver']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/1', 'p256dh' => 'p', 'auth' => 'a']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'fcm-1', 'platform' => 'android']);

        $this->mock(WebPushTransport::class)->shouldReceive('send')->once()
            ->withArgs(fn (Collection $t, array $p) => $t->pluck('endpoint')->all() === ['https://push.example/1'] && $p['title'] === 'T');
        $this->mock(FcmTransport::class)->shouldReceive('send')->once()
            ->withArgs(fn (Collection $t, array $p) => $t->pluck('fcm_token')->all() === ['fcm-1']);

        $user->notify($this->notification());
    }

    public function test_chi_co_token_web_thi_khong_goi_fcm(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'endpoint' => 'https://push.example/2', 'p256dh' => 'p', 'auth' => 'a']);

        $this->mock(WebPushTransport::class)->shouldReceive('send')->once();
        $this->mock(FcmTransport::class)->shouldNotReceive('send');

        $user->notify($this->notification());
    }

    public function test_khong_co_toPush_thi_khong_lam_gi(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        DeviceToken::create(['user_id' => $user->id, 'fcm_token' => 'fcm-2', 'platform' => 'android']);

        $this->mock(WebPushTransport::class)->shouldNotReceive('send');
        $this->mock(FcmTransport::class)->shouldNotReceive('send');

        (new PushChannel(app(WebPushTransport::class), app(FcmTransport::class)))
            ->send($user, new class extends Notification {});
    }
}
```

- [ ] **Step 3: Chạy, xác nhận fail**

Run: `$BE php artisan test --filter='FcmTransportTest|PushChannelTest'`
Expected: FAIL — class không tồn tại.

- [ ] **Step 4: `WebPushTransport`** — chuyển nguyên mã từ `WebPushChannel::send()`

```php
<?php
// backend/app/Channels/Push/WebPushTransport.php
namespace App\Channels\Push;

use App\Models\DeviceToken;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class WebPushTransport
{
    /** @param Collection<int, DeviceToken> $tokens  chỉ dòng có endpoint */
    public function send(Collection $tokens, array $payload): void
    {
        try {
            $webPush = new WebPush(['VAPID' => [
                'subject'    => config('services.vapid.subject'),
                'publicKey'  => config('services.vapid.public_key'),
                'privateKey' => config('services.vapid.private_key'),
            ]]);

            // channel/ttl là khái niệm của FCM; sw.ts không dùng — gửi đúng khung cũ.
            $body = json_encode(Arr::except($payload, ['channel', 'ttl']));

            foreach ($tokens as $token) {
                $sub = Subscription::create([
                    'endpoint' => $token->endpoint,
                    'keys'     => ['p256dh' => $token->p256dh, 'auth' => $token->auth],
                ]);
                $webPush->queueNotification($sub, $body);
            }

            foreach ($webPush->flush() as $report) {
                if ($report->isSubscriptionExpired()) {
                    DeviceToken::where('endpoint', $report->getEndpoint())->delete();
                } elseif ($report->isSuccess()) {
                    DeviceToken::where('endpoint', $report->getEndpoint())
                        ->update(['last_used_at' => now()]);
                }
            }
        } catch (\Throwable $e) {
            // VAPID keys not configured or other push error — fail silently
            Log::warning('WebPushTransport error: '.$e->getMessage());
        }
    }
}
```

- [ ] **Step 5: `FcmTransport`**

```php
<?php
// backend/app/Channels/Push/FcmTransport.php
namespace App\Channels\Push;

use App\Models\DeviceToken;
use App\Services\Fcm\FcmSender;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * Dịch payload trung tính của toPush() sang message FCM HTTP v1.
 *
 * Gửi dạng `notification` (không phải data-only): hệ thống Android tự hiện
 * thông báo kể cả khi app đã bị vuốt tắt — data-only thì phải có mã native
 * tự vẽ thông báo. Thêm iOS sau này = thêm khối `apns` ở buildMessage(), 13
 * notification không phải sửa.
 */
class FcmTransport
{
    public const DEFAULT_CHANNEL = 'general';

    /** Kênh có âm báo riêng — tên file trong res/raw (không đuôi). */
    private const CHANNEL_SOUNDS = ['new_ride' => 'new_ride'];

    public function __construct(private FcmSender $sender) {}

    /** @param Collection<int, DeviceToken> $tokens  chỉ dòng có fcm_token */
    public function send(Collection $tokens, array $payload): void
    {
        $values = $tokens->pluck('fcm_token')->filter()->values()->all();
        if ($values === []) {
            return;
        }

        try {
            $result = $this->sender->send($values, self::buildMessage($payload));
        } catch (\Throwable $e) {
            Log::warning('FcmTransport error: '.$e->getMessage());

            return;
        }

        if ($result->invalid !== []) {
            DeviceToken::whereIn('fcm_token', $result->invalid)->delete();
        }
        if ($result->delivered !== []) {
            DeviceToken::whereIn('fcm_token', $result->delivered)->update(['last_used_at' => now()]);
        }
    }

    public static function buildMessage(array $payload): array
    {
        $channel = $payload['channel'] ?? self::DEFAULT_CHANNEL;

        // FCM từ chối CẢ message nếu một giá trị data không phải chuỗi.
        $data = collect($payload['data'] ?? [])
            ->reject(fn ($v) => $v === null)
            ->map(fn ($v) => is_scalar($v) ? (is_bool($v) ? ($v ? '1' : '0') : (string) $v) : json_encode($v))
            ->all();
        // JS cần biết kênh khi app đang mở (hệ thống không tự phát âm báo lúc đó).
        $data['channel'] = $channel;

        $notification = ['channel_id' => $channel, 'sound' => self::CHANNEL_SOUNDS[$channel] ?? 'default'];
        if (! empty($payload['tag'])) {
            $notification['tag'] = $payload['tag'];
        }

        $android = ['priority' => 'high', 'notification' => $notification];
        if (isset($payload['ttl'])) {
            $android['ttl'] = ((int) $payload['ttl']).'s';
        }

        return [
            'notification' => [
                'title' => (string) ($payload['title'] ?? config('app.name')),
                'body' => (string) ($payload['body'] ?? ''),
            ],
            'data' => $data,
            'android' => $android,
        ];
    }
}
```

- [ ] **Step 6: `PushChannel`**

```php
<?php
// backend/app/Channels/PushChannel.php
namespace App\Channels;

use App\Channels\Push\FcmTransport;
use App\Channels\Push\WebPushTransport;
use App\Models\DeviceToken;

/**
 * Kênh push duy nhất cho mọi notification. Notification chỉ viết payload MỘT
 * lần ở toPush(); kênh tự chia token theo loại và giao cho transport tương ứng.
 * Mỗi transport tự nuốt lỗi — FCM hỏng không chặn Web Push và ngược lại.
 */
class PushChannel
{
    public function __construct(
        private WebPushTransport $webPush,
        private FcmTransport $fcm,
    ) {}

    public function send($notifiable, $notification): void
    {
        if (! method_exists($notification, 'toPush')) {
            return;
        }

        $tokens = DeviceToken::where('user_id', $notifiable->id)->get();
        if ($tokens->isEmpty()) {
            return;
        }

        $payload = $notification->toPush($notifiable, $notification);

        [$fcm, $web] = $tokens->partition(fn (DeviceToken $t) => $t->fcm_token !== null);

        if ($web->isNotEmpty()) {
            $this->webPush->send($web->values(), $payload);
        }
        if ($fcm->isNotEmpty()) {
            $this->fcm->send($fcm->values(), $payload);
        }
    }
}
```

- [ ] **Step 7: Chạy test**

Run: `$BE php artisan test --filter='FcmTransportTest|PushChannelTest'`
Expected: PASS 8/8.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Channels backend/tests/Feature/FcmTransportTest.php backend/tests/Feature/PushChannelTest.php
git commit -m "feat(backend): PushChannel chia token cho WebPushTransport và FcmTransport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chuyển 12 notification sang `PushChannel` / `toPush`

**Files:**
- Modify: 12 file `backend/app/Notifications/*.php`, `backend/tests/Feature/NewBookingNotificationChannelsTest.php`
- Delete: `backend/app/Channels/WebPushChannel.php`
- Test: `backend/tests/Feature/PushNotificationContractTest.php`

**Interfaces:**
- Consumes: `PushChannel` (Task 4).
- Produces: mọi notification dùng `PushChannel::class` và `toPush($notifiable, $notification): array`. `NewBookingAvailableNotification::toPush` có `channel = 'new_ride'`, `ttl = 300`.

- [ ] **Step 1: Test hợp đồng (fail)**

```php
<?php
// backend/tests/Feature/PushNotificationContractTest.php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Chặn notification mới (hoặc nhánh merge sau, vd Cuốc Free) quay lại dùng
 * WebPushChannel/toWebPush — app native sẽ không bao giờ nhận được loại đó.
 */
class PushNotificationContractTest extends TestCase
{
    public function test_khong_notification_nao_con_dung_web_push_cu(): void
    {
        foreach (glob(app_path('Notifications/*.php')) as $file) {
            $src = file_get_contents($file);
            $this->assertStringNotContainsString('WebPushChannel', $src, basename($file));
            $this->assertStringNotContainsString('toWebPush', $src, basename($file));
        }
        $this->assertFileDoesNotExist(app_path('Channels/WebPushChannel.php'));
    }
}
```

Thêm vào `NewBookingNotificationChannelsTest` (đồng thời đổi `use App\Channels\WebPushChannel;` → `use App\Channels\PushChannel;` và `[WebPushChannel::class]` → `[PushChannel::class]`):

```php
    public function test_cuoc_moi_dung_kenh_new_ride_ttl_5_phut(): void
    {
        $payload = (new NewBookingAvailableNotification($this->makeBooking()))
            ->toPush($this->makeDriver(), null);

        $this->assertSame('new_ride', $payload['channel']);
        $this->assertSame(300, $payload['ttl']);
    }

    public function test_notification_khac_khong_dat_kenh(): void
    {
        $payload = (new BookingCreatedNotification($this->makeBooking()))
            ->toPush(User::factory()->create(['role' => 'customer']), null);

        $this->assertArrayNotHasKey('channel', $payload);
    }
```
(Nếu constructor `BookingCreatedNotification` khác `(Booking)`, đọc file và truyền đúng tham số — test hiện có `test_cac_notification_khac_van_ghi_vao_bang` là mẫu.)

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `$BE php artisan test --filter='PushNotificationContractTest|NewBookingNotificationChannelsTest'`
Expected: FAIL.

- [ ] **Step 3: Đổi cơ học 12 file**

```bash
cd $WT/backend
grep -l "WebPushChannel\|toWebPush" app/Notifications/*.php | xargs sed -i '' \
  -e 's/App\\Channels\\WebPushChannel/App\\Channels\\PushChannel/' \
  -e 's/WebPushChannel::class/PushChannel::class/g' \
  -e 's/function toWebPush(/function toPush(/'
grep -rn "WebPush" app/Notifications   # phải không còn kết quả (trừ chữ "web push" trong comment — sửa tay thành "push")
git rm app/Channels/WebPushChannel.php
```

- [ ] **Step 4: Kênh cuốc mới** — `backend/app/Notifications/NewBookingAvailableNotification.php`, trong `toPush()` thêm 2 khoá vào mảng trả về:

```php
            'data' => ['action' => 'view_trip', 'booking_id' => $this->booking->id],
            // Âm báo "Green CA" ưu tiên cao. TTL 5 phút: quá hạn mà máy chưa nhận
            // thì FCM bỏ luôn — cuốc đã cũ, báo trễ chỉ làm tài xế bấm vào cuốc mất.
            'channel' => 'new_ride',
            'ttl' => 300,
```
Sửa docblock `via()`: "CHỈ web push" → "CHỈ push".

- [ ] **Step 5: Chạy toàn bộ test backend**

Run: `$BE php artisan test`
Expected: PASS toàn bộ (= baseline Task 0 + test mới).

- [ ] **Step 6: Commit**

```bash
git add -A backend/app/Notifications backend/app/Channels backend/tests/Feature/PushNotificationContractTest.php backend/tests/Feature/NewBookingNotificationChannelsTest.php
git commit -m "refactor(backend): 12 notification chuyển sang PushChannel/toPush, cuốc mới dùng kênh new_ride

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API phiên bản app + cài đặt admin (backend)

**Files:**
- Create: `backend/config/app_versions.php`, `backend/app/Http/Controllers/AppVersionController.php`
- Modify: `backend/app/Models/AppSetting.php`, `backend/app/Http/Controllers/Admin/AppSettingController.php`, `backend/routes/api.php`
- Test: `backend/tests/Feature/AppVersionTest.php`

**Interfaces:**
- Produces:
  - `GET /api/app/version?app=customer|driver&platform=android` (công khai) → `{ min_supported: string, latest: string, store_url: string }`.
  - `AppSetting::appVersionKey(string $platform, string $app, string $kind): string` → `"app_version_{$platform}_{$app}_{$kind}"`, `$kind` ∈ `min|latest`.
  - `GET/PUT /api/admin/settings` thêm 4 trường `app_version_android_customer_min`, `app_version_android_customer_latest`, `app_version_android_driver_min`, `app_version_android_driver_latest`.

- [ ] **Step 1: Test (fail)**

```php
<?php
// backend/tests/Feature/AppVersionTest.php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_mac_dinh_lay_tu_config_khong_can_dang_nhap(): void
    {
        $this->getJson('/api/app/version?app=driver&platform=android')
            ->assertOk()
            ->assertExactJson([
                'min_supported' => '1.0.0',
                'latest' => '1.0.0',
                'store_url' => 'https://play.google.com/store/apps/details?id=vn.greenca.driver',
            ]);
    }

    public function test_uu_tien_gia_tri_admin_da_luu(): void
    {
        AppSetting::set(AppSetting::appVersionKey('android', 'customer', 'min'), '1.2.0');
        AppSetting::set(AppSetting::appVersionKey('android', 'customer', 'latest'), '1.4.0');

        $this->getJson('/api/app/version?app=customer&platform=android')
            ->assertOk()
            ->assertJson(['min_supported' => '1.2.0', 'latest' => '1.4.0']);
    }

    public function test_tham_so_sai_thi_422(): void
    {
        $this->getJson('/api/app/version?app=admin&platform=android')->assertStatus(422);
        $this->getJson('/api/app/version?app=driver&platform=ios')->assertStatus(422);
        $this->getJson('/api/app/version')->assertStatus(422);
    }

    private function adminPut(array $extra)
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return $this->actingAs($admin, 'sanctum')->putJson('/api/admin/settings', [
            'contact_hotline' => '1800 6789',
            'contact_email' => 'support@greenca.vn',
            'contact_zalo_phone' => '0931919786',
            ...$extra,
        ]);
    }

    public function test_admin_luu_va_doc_phien_ban(): void
    {
        $this->adminPut([
            'app_version_android_driver_min' => '1.1.0',
            'app_version_android_driver_latest' => '1.3.0',
        ])->assertOk()->assertJson([
            'app_version_android_driver_min' => '1.1.0',
            'app_version_android_driver_latest' => '1.3.0',
            'app_version_android_customer_min' => '1.0.0',
        ]);
    }

    public function test_admin_nhap_sai_dinh_dang_thi_422(): void
    {
        $this->adminPut(['app_version_android_driver_min' => '1.0'])->assertStatus(422);
        $this->adminPut(['app_version_android_driver_min' => 'v1.0.0'])->assertStatus(422);
    }

    public function test_min_lon_hon_latest_thi_422_va_khong_luu(): void
    {
        $this->adminPut([
            'app_version_android_customer_min' => '2.0.0',
            'app_version_android_customer_latest' => '1.9.0',
        ])->assertStatus(422)->assertJsonValidationErrors('app_version_android_customer_min');

        // Chỉ gửi min, latest đang là mặc định 1.0.0 → cũng phải chặn.
        $this->adminPut(['app_version_android_driver_min' => '1.10.0'])
            ->assertStatus(422);

        $this->assertNull(AppSetting::get(AppSetting::appVersionKey('android', 'customer', 'min')));
    }
}
```

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `$BE php artisan test --filter=AppVersionTest`
Expected: FAIL — 404 / method không tồn tại.

- [ ] **Step 3: Config**

```php
<?php
// backend/config/app_versions.php

/**
 * Phiên bản app native. min_supported / latest do admin sửa (AppSetting),
 * đây chỉ là giá trị mặc định khi admin chưa lưu gì.
 *
 * ⚠️ Mặc định PHẢI bằng phiên bản phát hành đầu tiên — cao hơn là khoá toàn
 * bộ người dùng ngoài app.
 */
return [
    'default' => '1.0.0',

    'store_urls' => [
        'android' => [
            'customer' => env('APP_STORE_URL_ANDROID_CUSTOMER', 'https://play.google.com/store/apps/details?id=vn.greenca.customer'),
            'driver' => env('APP_STORE_URL_ANDROID_DRIVER', 'https://play.google.com/store/apps/details?id=vn.greenca.driver'),
        ],
    ],
];
```

- [ ] **Step 4: `AppSetting`** — thêm hằng và hàm (trong class):

```php
    public const APP_VERSION_PLATFORMS = ['android'];

    public const APP_VERSION_APPS = ['customer', 'driver'];

    public static function appVersionKey(string $platform, string $app, string $kind): string
    {
        return "app_version_{$platform}_{$app}_{$kind}";
    }

    public static function appVersion(string $platform, string $app, string $kind): string
    {
        return static::get(static::appVersionKey($platform, $app, $kind), config('app_versions.default'));
    }
```

- [ ] **Step 5: `AppVersionController`**

```php
<?php
// backend/app/Http/Controllers/AppVersionController.php
namespace App\Http\Controllers;

use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Công khai, không auth: app gọi lúc khởi động — kể cả khi chưa đăng nhập.
 * App xử lý fail-open nên endpoint này lỗi không khoá ai ngoài app.
 */
class AppVersionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'app' => ['required', Rule::in(AppSetting::APP_VERSION_APPS)],
            'platform' => ['required', Rule::in(AppSetting::APP_VERSION_PLATFORMS)],
        ]);

        return response()->json([
            'min_supported' => AppSetting::appVersion($data['platform'], $data['app'], 'min'),
            'latest' => AppSetting::appVersion($data['platform'], $data['app'], 'latest'),
            'store_url' => config("app_versions.store_urls.{$data['platform']}.{$data['app']}"),
        ]);
    }
}
```

`backend/routes/api.php`: thêm `use App\Http\Controllers\AppVersionController;` và trong khối public, sau `Route::get('/settings/contact', …)`:
```php
Route::get('/app/version', [AppVersionController::class, 'show']);
```

- [ ] **Step 6: Admin settings** — `backend/app/Http/Controllers/Admin/AppSettingController.php`

Trong `index()` thêm vào mảng trả về `...$this->appVersions(),` và thêm method:
```php
    /** @return array<string, string> vd ['app_version_android_driver_min' => '1.0.0', …] */
    private function appVersions(): array
    {
        $out = [];
        foreach (AppSetting::APP_VERSION_PLATFORMS as $platform) {
            foreach (AppSetting::APP_VERSION_APPS as $app) {
                foreach (['min', 'latest'] as $kind) {
                    $out[AppSetting::appVersionKey($platform, $app, $kind)] = AppSetting::appVersion($platform, $app, $kind);
                }
            }
        }

        return $out;
    }
```

Trong `update()`: thêm luật validate cho từng key (trước `$request->validate`):
```php
        $versionRules = collect($this->appVersions())
            ->keys()
            ->mapWithKeys(fn ($key) => [$key => ['sometimes', 'required', 'string', 'regex:/^\d+\.\d+\.\d+$/']])
            ->all();
```
đổi `$request->validate([...])` thành `$request->validate([... , ...$versionRules])`, rồi **trước** khi gọi `AppSetting::set`:
```php
        // min > latest = mọi bản app bị chặn ở màn cập nhật trong khi store chưa
        // có bản nào đủ mới → khoá toàn bộ người dùng ngoài app.
        foreach (AppSetting::APP_VERSION_PLATFORMS as $platform) {
            foreach (AppSetting::APP_VERSION_APPS as $app) {
                $minKey = AppSetting::appVersionKey($platform, $app, 'min');
                $latestKey = AppSetting::appVersionKey($platform, $app, 'latest');
                $min = $data[$minKey] ?? AppSetting::appVersion($platform, $app, 'min');
                $latest = $data[$latestKey] ?? AppSetting::appVersion($platform, $app, 'latest');
                if (version_compare($min, $latest, '>')) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        $minKey => 'Phiên bản tối thiểu không được lớn hơn phiên bản mới nhất.',
                    ]);
                }
            }
        }
```
và sau vòng `foreach` lưu các key cũ:
```php
        foreach (array_keys($versionRules) as $key) {
            if (array_key_exists($key, $data)) {
                AppSetting::set($key, $data[$key]);
            }
        }
```

- [ ] **Step 7: Chạy test**

Run: `$BE php artisan test --filter='AppVersionTest|AppSettingsTest'`
Expected: PASS toàn bộ.

- [ ] **Step 8: Commit**

```bash
git add backend/config/app_versions.php backend/app/Http/Controllers/AppVersionController.php backend/app/Models/AppSetting.php backend/app/Http/Controllers/Admin/AppSettingController.php backend/routes/api.php backend/tests/Feature/AppVersionTest.php
git commit -m "feat(backend): API phiên bản app native cho cơ chế buộc cập nhật, admin chỉnh được

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Mode build `native` + phụ thuộc Capacitor ở frontend

**Files:**
- Create: `frontend/src/platform.ts`, `frontend/.env.native` (không commit)
- Modify: `frontend/vite.config.ts`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/.gitignore`, `.gitignore` (gốc)

**Interfaces:**
- Produces: `isNativeApp(): boolean` từ `@/platform`. Script `build:customer:native` → `frontend/dist-native/`, `build:driver:native` → `frontend/dist-driver-native/`. Bản native không có service worker / manifest.

- [ ] **Step 1: Cài plugin (ghim chính xác)**

```bash
cd $WT/frontend
npm install --save-exact @capacitor/core@^8 @capacitor/app@^8 @capacitor/push-notifications@^8 @capacitor/share@^8 @capacitor/status-bar@^8
grep '"@capacitor' package.json
```
Expected: 5 dòng, mỗi dòng là phiên bản chính xác (không `^`). Ghi lại — Task 12 dùng đúng các số này.

- [ ] **Step 2: `src/platform.ts`**

```ts
import { Capacitor } from '@capacitor/core'

/**
 * Đang chạy trong vỏ app native (Capacitor) hay trình duyệt.
 *
 * Mọi nhánh native/web PHẢI đi qua hàm này hoặc một facade dùng nó — không rải
 * `Capacitor.*` khắp code, để thay vỏ app sau này chỉ phải sửa các facade.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}
```

- [ ] **Step 3: `vite.config.ts`**

Trong `APPS`, thêm `nativeOutDir` cho từng app: customer `'dist-native'`, driver `'dist-driver-native'`, admin `null`.

Thay `REQUIRED_DEPLOY_ENV` / `assertDeployEnv` / `createAppConfig` bằng:
```ts
const REQUIRED_DEPLOY_ENV = ['VITE_VAPID_PUBLIC_KEY', 'VITE_REVERB_APP_KEY'] as const

// App native không dùng Web Push (FCM thay thế) nên KHÔNG bắt VAPID. Bù lại bắt
// API_BASE: thiếu là mọi request trỏ vào chính vỏ app và chết; và
// VITE_DRIVER_APP_URL: link giới thiệu của tài xế lấy từ đây (xem webOrigin.ts).
const REQUIRED_NATIVE_ENV = ['VITE_API_BASE_URL', 'VITE_REVERB_APP_KEY', 'VITE_DRIVER_APP_URL'] as const

function assertEnv(mode: string, required: readonly string[]) {
  const env = loadEnv(mode, __dirname)
  const missing = required.filter((key) => !env[key])
  if (missing.length === 0) return
  throw new Error(
    `[build --mode ${mode}] thiếu biến env bắt buộc: ${missing.join(', ')}. ` +
    'Kiểm tra frontend/.env (không tracked — worktree mới không có sẵn) và frontend/.env.' + mode,
  )
}

export function createAppConfig(target: AppTarget) {
  return ({ command, mode }: ConfigEnv): UserConfig => {
    const isNative = mode === 'native'
    if (command === 'build' && (mode === 'production' || mode === 'staging')) assertEnv(mode, REQUIRED_DEPLOY_ENV)
    if (command === 'build' && isNative) assertEnv(mode, REQUIRED_NATIVE_ENV)
    return buildAppConfig(target, isNative)
  }
}
```

Trong `buildAppConfig(target: AppTarget, isNative = false)`:
```ts
  const app = APPS[target]
  if (isNative && !app.nativeOutDir) throw new Error(`[native] app ${target} không có bản native`)
```
thêm `disable: isNative,` làm khoá đầu tiên của `VitePWA({...})` kèm comment:
```ts
        // App native: không service worker. SW trong WebView vẫn nhận Web Push song
        // song với FCM → thông báo hiện HAI lần; và precache làm bundle cũ bám dai.
        disable: isNative,
```
và `build: { outDir: isNative ? app.nativeOutDir! : app.outDir },`.

- [ ] **Step 4: Script + ignore**

`frontend/package.json` `scripts` thêm:
```json
    "build:customer:native": "tsc -b && vite build --config vite.customer.config.ts --mode native",
    "build:driver:native": "tsc -b && vite build --config vite.driver.config.ts --mode native",
```
`frontend/.gitignore` thêm các dòng: `dist-native`, `dist-driver-native`, `.env.native`.
`.gitignore` gốc thêm: `dist-mobile/`.

- [ ] **Step 5: Tạo `.env.native`** (không commit — nội dung sẽ ghi vào `docs/MOBILE.md` ở Task 14)

```bash
cd $WT/frontend
{
  echo "# Build app native (Capacitor) — trỏ STAGING. Production: đổi 2 URL + REVERB key."
  echo "VITE_API_BASE_URL=https://webco.io.vn"
  grep '^VITE_REVERB_APP_KEY=' .env.staging
  echo "# Trống: echo.ts suy host + TLS từ VITE_API_BASE_URL"
  echo "VITE_REVERB_HOST="
  echo "VITE_REVERB_PORT="
  echo "VITE_REVERB_SCHEME="
  echo "VITE_DRIVER_APP_URL=https://driver.webco.io.vn"
} > .env.native
```

- [ ] **Step 6: Kiểm build**

```bash
cd $WT/frontend
npm run build:customer:native && npm run build:driver:native
ls dist-native/sw.js dist-native/manifest.webmanifest 2>&1 | grep -c "No such file"   # 2
grep -l "webco.io.vn" dist-native/assets/*.js | head -1                               # có kết quả
npm run build:customer -- --mode staging && ls dist/sw.js                              # web vẫn có SW
mv .env.native /tmp/.env.native.bak && (npm run build:driver:native 2>&1 | grep "thiếu biến env"); mv /tmp/.env.native.bak .env.native
```
Expected: đúng như chú thích từng dòng; lệnh cuối in thông báo thiếu `VITE_API_BASE_URL`.

- [ ] **Step 7: Lint + commit**

```bash
npm run lint
git add frontend/src/platform.ts frontend/vite.config.ts frontend/package.json frontend/package-lock.json frontend/.gitignore .gitignore
git commit -m "feat(frontend): mode build native cho app Capacitor — tắt service worker, bắt buộc API_BASE

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tách `push.ts` thành facade `src/push/` (thuần refactor)

**Files:**
- Create: `frontend/src/push/index.ts`, `frontend/src/push/web.ts`, `frontend/src/push/types.ts`, `frontend/src/push/route.ts`, `frontend/tests-unit/pushRoute.test.ts`
- Delete: `frontend/src/push.ts`
- Modify: `frontend/src/sw.ts`, `frontend/package.json`

**Interfaces:**
- Consumes: `isNativeApp` (Task 7).
- Produces:
  - `@/push` export **đúng như cũ**: `getPushStatus(): PushStatus`, `registerPushSubscription(): Promise<PushResult>`, `syncPushSubscription(): Promise<void>`, `unregisterPushSubscription(): Promise<void>`, type `PushStatus`, `PushResult`.
  - `src/push/route.ts`: `type PushData = { action?: string; booking_id?: number | string; url?: string }`, `pushRoute(data: PushData): string`.
  - Script `npm run test:unit` (Node test runner, không thêm thư viện).
  - Task 9 thêm `src/push/native.ts` với cùng 4 hàm; ở task này `index.ts` chỉ gọi `web`.

- [ ] **Step 1: Test `pushRoute` (fail)**

```ts
// frontend/tests-unit/pushRoute.test.ts
// Chạy bằng Node test runner (Node 22 tự bỏ type): npm run test:unit
// Không nằm trong tsconfig (src) — chỉ import module thuần, không alias '@/'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pushRoute } from '../src/push/route.ts'

test('action có booking_id', () => {
  assert.equal(pushRoute({ action: 'view_booking', booking_id: 7 }), '/customer/booking/7')
  assert.equal(pushRoute({ action: 'view_trip', booking_id: '42' }), '/driver/trips/42')
})

test('view_wallet', () => {
  assert.equal(pushRoute({ action: 'view_wallet' }), '/driver/wallet')
})

test('open_url chỉ nhận đường dẫn nội bộ', () => {
  assert.equal(pushRoute({ action: 'open_url', url: '/driver/free' }), '/driver/free')
  assert.equal(pushRoute({ action: 'open_url', url: '//evil.com/x' }), '/')
  assert.equal(pushRoute({ action: 'open_url', url: 'https://evil.com' }), '/')
  assert.equal(pushRoute({ action: 'open_url' }), '/')
})

test('thiếu dữ liệu hoặc action lạ thì về trang chủ', () => {
  assert.equal(pushRoute({ action: 'view_trip' }), '/')
  assert.equal(pushRoute({ action: 'unknown', booking_id: 1 }), '/')
  assert.equal(pushRoute({}), '/')
})
```

`frontend/package.json` `scripts` thêm: `"test:unit": "node --test tests-unit/*.test.ts"`.

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `cd $WT/frontend && npm run test:unit`
Expected: FAIL — không tìm thấy `../src/push/route.ts`.

- [ ] **Step 3: `route.ts`**

```ts
// frontend/src/push/route.ts
// Ánh xạ action trong payload push → đường dẫn trong app. Dùng chung cho
// service worker (web) và FCM (native) — sửa một chỗ, hai nền tảng cùng đúng.
// Module thuần: không import gì, để sw.ts và Node test import được.

export type PushData = { action?: string; booking_id?: number | string; url?: string }

export function pushRoute(data: PushData): string {
  const { action, booking_id, url } = data
  if (action === 'view_booking' && booking_id) return `/customer/booking/${booking_id}`
  if (action === 'view_trip' && booking_id) return `/driver/trips/${booking_id}`
  if (action === 'view_wallet') return '/driver/wallet'
  // Chỉ đường dẫn nội bộ: `//host` là URL tuyệt đối theo giao thức hiện tại.
  if (action === 'open_url' && url && url.startsWith('/') && !url.startsWith('//')) return url
  return '/'
}
```

- [ ] **Step 4: Chạy test**

Run: `npm run test:unit`
Expected: PASS 4/4.

- [ ] **Step 5: Tách file**

```bash
cd $WT/frontend
git mv src/push.ts src/push/web.ts
```
Tạo `src/push/types.ts`: chuyển nguyên khối docblock + `export type PushStatus = …` và `export type PushResult = …` từ `web.ts` sang; trong `web.ts` thay bằng `import type { PushStatus, PushResult } from './types'`.

`src/push/index.ts`:
```ts
// Facade push: chọn Web Push (trình duyệt) hay FCM (app native).
// Giữ NGUYÊN tên export của push.ts cũ — 7 nơi gọi import '@/push' không phải sửa.
import * as web from './web'

export type { PushStatus, PushResult } from './types'

const impl = web

export const getPushStatus = () => impl.getPushStatus()
export const registerPushSubscription = () => impl.registerPushSubscription()
export const syncPushSubscription = () => impl.syncPushSubscription()
export const unregisterPushSubscription = () => impl.unregisterPushSubscription()
```

- [ ] **Step 6: `sw.ts` dùng `pushRoute`**

Thêm `import { pushRoute, type PushData } from './push/route'`. Trong `notificationclick`, thay khối từ `const { action, booking_id } = …` tới hết các nhánh `if/else if` bằng:
```ts
  const url = pushRoute((event.notification.data ?? {}) as PushData)
```

- [ ] **Step 7: Kiểm**

```bash
npm run lint && npm run test:unit
npm run build:driver -- --mode staging && grep -c "driver/trips" dist-driver/sw.js
```
Expected: lint sạch; test PASS; build OK; `sw.js` vẫn chứa `driver/trips` (≥1).

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src/push frontend/src/push.ts frontend/src/sw.ts frontend/tests-unit frontend/package.json
git commit -m "refactor(frontend): tách push.ts thành facade src/push, ánh xạ action dùng chung với sw.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Push native (FCM) ở frontend

**Files:**
- Create: `frontend/src/push/native.ts`, `frontend/src/push/sound.ts`, `frontend/public/sounds/.gitkeep`
- Modify: `frontend/src/push/index.ts`, `frontend/src/api/notifications.ts`, `frontend/src/bootstrap.tsx`, `frontend/src/main.driver.tsx`

**Interfaces:**
- Consumes: `isNativeApp` (Task 7); `pushRoute`, `PushData`, `PushStatus`, `PushResult` (Task 8); API `device-token` dạng FCM (Task 2); `data.channel` từ `FcmTransport` (Task 4).
- Produces:
  - `initNativePush(navigate: (path: string) => void, opts: { rideChannel: boolean }): Promise<void>`
  - `playNewRideSound(): void`; file âm báo tại `/sounds/new_ride.mp3` (Task 13 tạo file).
  - `bootstrap(router, app?: 'customer' | 'driver' | 'admin')`.
  - `registerFcmToken(token: string)`, `removeFcmToken(token: string)`.

- [ ] **Step 1: API**

`frontend/src/api/notifications.ts` thêm:
```ts
import { Capacitor } from '@capacitor/core'

// App native (FCM). platform lấy từ Capacitor để iOS sau này không phải sửa.
export const registerFcmToken = (fcm_token: string) =>
  api.post('/device-token', { fcm_token, platform: Capacitor.getPlatform() }).then((r) => r.data)

export const removeFcmToken = (fcm_token: string) =>
  api.delete('/device-token', { data: { fcm_token } }).then((r) => r.data)
```

- [ ] **Step 2: `sound.ts`**

```ts
// frontend/src/push/sound.ts
// Âm báo cuốc mới khi app ĐANG MỞ. Lúc app ở nền / bị tắt, hệ thống tự phát âm
// của kênh `new_ride` (res/raw/new_ride.mp3 — cùng file, chép lúc build).
const NEW_RIDE_SOUND = '/sounds/new_ride.mp3'

export function playNewRideSound(): void {
  new Audio(NEW_RIDE_SOUND).play().catch((e) => {
    // WebView có thể chặn tự phát — xem Task 15 bước kiểm âm báo khi app đang mở.
    console.warn('[push] không phát được âm báo cuốc mới', e)
  })
}
```
Tạo `frontend/public/sounds/.gitkeep` (rỗng).

- [ ] **Step 3: `native.ts`**

```ts
// frontend/src/push/native.ts
// Push cho app native qua FCM (@capacitor/push-notifications).
// Cùng chữ ký với web.ts để facade index.ts hoán đổi được.
import { PushNotifications, type PermissionStatus } from '@capacitor/push-notifications'
import { registerFcmToken, removeFcmToken } from '@/api/notifications'
import { useUiStore } from '@/stores/ui'
import { pushRoute, type PushData } from './route'
import { playNewRideSound } from './sound'
import type { PushResult, PushStatus } from './types'

const REGISTRATION_TIMEOUT_MS = 15_000

let permission: PushStatus = 'default'
let currentToken: string | null = null
let waiters: Array<(token: string) => void> = []

function toStatus(p: PermissionStatus['receive']): PushStatus {
  if (p === 'granted') return 'granted'
  if (p === 'denied') return 'denied'
  return 'default' // prompt | prompt-with-rationale
}

/** Đồng bộ như bản web: đọc trạng thái đã cache (cập nhật lúc init và sau mỗi lần xin quyền). */
export function getPushStatus(): PushStatus {
  return permission
}

/** register() không trả token — token về qua sự kiện `registration`. */
async function obtainToken(): Promise<string> {
  const token = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('FCM registration timeout')), REGISTRATION_TIMEOUT_MS)
    waiters.push((t) => { clearTimeout(timer); resolve(t) })
  })
  await PushNotifications.register()
  return token
}

export async function registerPushSubscription(): Promise<PushResult> {
  try {
    permission = toStatus((await PushNotifications.requestPermissions()).receive)
    if (permission !== 'granted') return { ok: false, status: permission }
    await registerFcmToken(await obtainToken())
    return { ok: true }
  } catch (e) {
    console.warn('[push] đăng ký FCM thất bại', e)
    return { ok: false, status: 'error' }
  }
}

/** Mở app: gửi lại token (FCM có thể xoay token). Không bao giờ hiện hộp xin quyền. */
export async function syncPushSubscription(): Promise<void> {
  try {
    permission = toStatus((await PushNotifications.checkPermissions()).receive)
    if (permission !== 'granted') return
    await registerFcmToken(await obtainToken())
  } catch (e) {
    console.warn('[push] đồng bộ FCM token thất bại', e)
  }
}

/** Đăng xuất: gỡ token khỏi server để máy này không nhận push của tài khoản cũ. */
export async function unregisterPushSubscription(): Promise<void> {
  try {
    const token = currentToken ?? (permission === 'granted' ? await obtainToken() : null)
    if (token) await removeFcmToken(token)
  } catch {
    // silently fail
  }
}

/**
 * Gọi MỘT lần lúc khởi động app native.
 * - Listener `pushNotificationActionPerformed` gắn sớm: Capacitor giữ sự kiện chạm
 *   thông báo lúc mở app nguội cho tới khi có listener.
 * - createChannel gọi lặp lại vô hại. Âm báo của kênh bị Android KHOÁ khi kênh đã
 *   tạo trên máy — đổi file âm báo = phải đổi id kênh (new_ride_v2).
 */
export async function initNativePush(
  navigate: (path: string) => void,
  opts: { rideChannel: boolean },
): Promise<void> {
  await PushNotifications.addListener('registration', ({ value }) => {
    currentToken = value
    const pending = waiters
    waiters = []
    pending.forEach((resolve) => resolve(value))
  })
  await PushNotifications.addListener('registrationError', (e) => {
    console.warn('[push] FCM registration lỗi', e)
  })
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    navigate(pushRoute((notification.data ?? {}) as PushData))
  })
  // App đang mở: hệ thống KHÔNG tự hiện thông báo FCM — tự phát âm báo + toast.
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    const data = (n.data ?? {}) as PushData & { channel?: string }
    if (data.channel === 'new_ride') playNewRideSound()
    const message = n.body || n.title
    if (message) useUiStore.getState().showToast(message, 'info')
  })

  if (opts.rideChannel) {
    await PushNotifications.createChannel({
      id: 'new_ride', name: 'Cuốc mới', description: 'Báo cuốc mới và Cuốc Free',
      importance: 5, sound: 'new_ride', vibration: true, visibility: 1,
    })
  }
  await PushNotifications.createChannel({
    id: 'general', name: 'Thông báo chung', description: 'Trạng thái chuyến, ví, khuyến mãi',
    importance: 4, vibration: true, visibility: 1,
  })

  permission = toStatus((await PushNotifications.checkPermissions()).receive)
}
```

- [ ] **Step 4: Facade chọn native**

`src/push/index.ts` — thay `const impl = web` bằng:
```ts
import { isNativeApp } from '@/platform'
import * as native from './native'

const impl = isNativeApp() ? native : web
```
(và giữ `import * as web from './web'`), thêm `export { initNativePush } from './native'`.

- [ ] **Step 5: `bootstrap.tsx`**

Đổi chữ ký và thêm khởi tạo native (giữ nguyên phần còn lại):
```tsx
import { isNativeApp } from '@/platform'
import { initNativePush } from '@/push'

export type AppKind = 'customer' | 'driver' | 'admin'

export function bootstrap(router: AppRouter, app: AppKind = 'customer') {
  // … queryClient, beforeinstallprompt, appinstalled như cũ …

  if (isNativeApp()) {
    // Chỉ app tài xế có kênh "Cuốc mới" — app khách hiện kênh này trong Cài đặt
    // Android là vô nghĩa với người dùng.
    initNativePush((path) => { void router.navigate(path) }, { rideChannel: app === 'driver' })
      .catch((e) => console.warn('[push] khởi tạo FCM thất bại', e))
  }

  createRoot(…)  // như cũ
}
```
`src/main.driver.tsx`: `bootstrap(router, 'driver')`. (`main.tsx` giữ mặc định `'customer'`; kiểm `main.admin.tsx` nếu gọi `bootstrap` thì truyền `'admin'`.)

- [ ] **Step 6: Kiểm**

```bash
cd $WT/frontend && npm run lint && npm run test:unit
npm run build:driver:native && npm run build:driver -- --mode staging
```
Expected: sạch, PASS, 2 build OK. (Hành vi FCM kiểm trên emulator ở Task 15.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/push frontend/src/api/notifications.ts frontend/src/bootstrap.tsx frontend/src/main.driver.tsx frontend/src/main.admin.tsx frontend/public/sounds/.gitkeep
git commit -m "feat(frontend): push FCM cho app native — kênh Cuốc mới, chạm thông báo mở đúng trang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tương thích tính năng PWA trong WebView

**Files:**
- Create: `frontend/src/share.ts`, `frontend/src/webOrigin.ts`, `frontend/src/nativeShell.ts`
- Modify: `frontend/src/hooks/usePwaInstall.ts`, `frontend/src/pages/customer/ProfilePage.tsx`, `frontend/src/pages/driver/ProfilePage.tsx`, `frontend/src/bootstrap.tsx`

**Interfaces:**
- Consumes: `isNativeApp` (Task 7), `API_BASE` (Task 1).
- Produces: `canShare(): boolean`, `shareLink(opts: { title: string; text: string; url: string }): Promise<void>`, `webOrigin(app: 'customer' | 'driver'): string`, `initNativeShell(): void`. `usePwaInstall().canInstall === false` trong app native.

- [ ] **Step 1: `webOrigin.ts`**

```ts
// frontend/src/webOrigin.ts
import { API_BASE } from '@/api/base'
import { isNativeApp } from '@/platform'

/**
 * Origin công khai của bản web — dùng cho link GỬI RA NGOÀI (link giới thiệu).
 *
 * Trong app native, window.location.origin là tên giả của WebView
 * (https://app.greenca.vn) — người nhận bấm vào sẽ ra trang không tồn tại.
 */
export function webOrigin(app: 'customer' | 'driver'): string {
  if (!isNativeApp()) return window.location.origin
  return app === 'customer' ? API_BASE : (import.meta.env.VITE_DRIVER_APP_URL as string)
}
```

- [ ] **Step 2: `share.ts`**

```ts
// frontend/src/share.ts
import { Share } from '@capacitor/share'
import { isNativeApp } from '@/platform'

/** WebView Android không có navigator.share — app native dùng khay chia sẻ hệ thống. */
export function canShare(): boolean {
  return isNativeApp() || typeof navigator.share === 'function'
}

export async function shareLink(opts: { title: string; text: string; url: string }): Promise<void> {
  try {
    if (isNativeApp()) await Share.share({ ...opts, dialogTitle: 'Chia sẻ qua' })
    else await navigator.share(opts)
  } catch {
    // người dùng đóng khay chia sẻ — không phải lỗi
  }
}
```

- [ ] **Step 3: Sửa 2 trang Profile**

Ở **cả** `pages/customer/ProfilePage.tsx` và `pages/driver/ProfilePage.tsx`:
- import `import { canShare, shareLink } from '@/share'` và `import { webOrigin } from '@/webOrigin'`.
- Mọi `` `${window.location.origin}/login?ref=${user.referral_code}` `` → `` `${webOrigin('customer')}/login?ref=${user.referral_code}` `` (trang driver dùng `webOrigin('driver')`). Có 2 chỗ mỗi trang (nút sao chép + nút chia sẻ).
- `{typeof navigator.share === 'function' && (` → `{canShare() && (`
- `onClick={() => navigator.share({` → `onClick={() => shareLink({` (giữ nguyên `title`, `text`, `url`).

Kiểm: `grep -rn "window.location.origin\|navigator.share" src/pages` → không còn kết quả.

- [ ] **Step 4: Ẩn UI cài PWA**

`src/hooks/usePwaInstall.ts`: import `isNativeApp` từ `@/platform`, đổi dòng `canInstall`:
```ts
  // App native đã là app thật — mọi lối "Cài đặt ứng dụng" (Splash, Header,
  // Profile, Cài đặt thông báo) đều dựa vào cờ này nên tắt ở đây là đủ.
  const canInstall = !isNativeApp() && !isStandalone && !isInstalled && (!!deferredInstallPrompt || isIos)
```

- [ ] **Step 5: `nativeShell.ts` — nút Back + status bar**

Cài plugin: `cd $WT/frontend && npm install --save-exact @capacitor/status-bar@^8` (đã cài ở Task 7 — bỏ qua nếu có).

```ts
// frontend/src/nativeShell.ts
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isNativeApp } from '@/platform'

/** Hành vi vỏ app native. Không làm gì trên web. */
export function initNativeShell(): void {
  if (!isNativeApp()) return

  // Mặc định nút Back Android thoát app ngay cả khi đang ở trang con.
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })

  // Style.Dark = chữ sáng trên nền tối (màu primary).
  StatusBar.setBackgroundColor({ color: '#006a36' }).catch(() => {})
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
}
```
`bootstrap.tsx`: import và gọi `initNativeShell()` ngay đầu hàm `bootstrap`.

- [ ] **Step 6: Kiểm + commit**

```bash
npm run lint && npm run build:customer:native && npm run build:customer -- --mode staging
git add frontend/src/share.ts frontend/src/webOrigin.ts frontend/src/nativeShell.ts frontend/src/hooks/usePwaInstall.ts frontend/src/pages/customer/ProfilePage.tsx frontend/src/pages/driver/ProfilePage.tsx frontend/src/bootstrap.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): tương thích WebView — chia sẻ hệ thống, link giới thiệu đúng domain, nút Back, ẩn cài PWA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Màn buộc cập nhật + cài đặt phiên bản ở admin (frontend)

**Files:**
- Create: `frontend/src/utils/appVersion.ts`, `frontend/src/api/appVersion.ts`, `frontend/src/hooks/useAppVersionGate.ts`, `frontend/src/components/common/AppVersionGate.tsx`, `frontend/tests-unit/appVersion.test.ts`
- Modify: `frontend/src/bootstrap.tsx`, `frontend/src/api/settings.ts`, `frontend/src/pages/admin/SettingsPage.tsx`

**Interfaces:**
- Consumes: `GET /api/app/version` + 4 trường admin (Task 6); `isNativeApp` (Task 7); `AppKind` (Task 9).
- Produces: `parseVersion`, `compareVersions(a, b): number | null`, `evaluateGate(current: string, info: AppVersionInfo): VersionGate`; `<AppVersionGate app>` bọc toàn app.

- [ ] **Step 1: Test (fail)**

```ts
// frontend/tests-unit/appVersion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, evaluateGate } from '../src/utils/appVersion.ts'

const info = (min: string, latest: string) => ({ min_supported: min, latest, store_url: 'https://s' })

test('so sánh theo số, không theo chuỗi', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
})

test('chuỗi sai định dạng → null', () => {
  assert.equal(compareVersions('', '1.0.0'), null)
  assert.equal(compareVersions('1.0', '1.0.0'), null)
  assert.equal(compareVersions('1.0.0', 'abc'), null)
})

test('thấp hơn min → chặn', () => {
  assert.deepEqual(evaluateGate('1.0.0', info('1.1.0', '1.2.0')), { state: 'blocked', storeUrl: 'https://s' })
})

test('đạt min nhưng thấp hơn latest → nhắc', () => {
  assert.deepEqual(evaluateGate('1.1.0', info('1.1.0', '1.2.0')), { state: 'soft', storeUrl: 'https://s' })
})

test('mới nhất → ok', () => {
  assert.deepEqual(evaluateGate('1.2.0', info('1.1.0', '1.2.0')), { state: 'ok' })
})

test('dữ liệu sai → cho qua (fail-open)', () => {
  assert.deepEqual(evaluateGate('1.0.0', info('', '')), { state: 'ok' })
  assert.deepEqual(evaluateGate('', info('9.0.0', '9.0.0')), { state: 'ok' })
})
```

- [ ] **Step 2: Chạy, xác nhận fail**

Run: `npm run test:unit`
Expected: FAIL — không tìm thấy `../src/utils/appVersion.ts`.

- [ ] **Step 3: `utils/appVersion.ts`** (module thuần)

```ts
// frontend/src/utils/appVersion.ts
// Logic buộc cập nhật — module thuần để Node test import được.

export type AppVersionInfo = { min_supported: string; latest: string; store_url: string }
export type VersionGate = { state: 'ok' } | { state: 'soft' | 'blocked'; storeUrl: string }

export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** -1 / 0 / 1; null nếu một trong hai chuỗi sai định dạng. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** Dữ liệu sai → 'ok': server trả rác không được khoá người dùng ngoài app. */
export function evaluateGate(current: string, info: AppVersionInfo): VersionGate {
  if (compareVersions(current, info.min_supported) === -1) return { state: 'blocked', storeUrl: info.store_url }
  if (compareVersions(current, info.latest) === -1) return { state: 'soft', storeUrl: info.store_url }
  return { state: 'ok' }
}
```

- [ ] **Step 4: Chạy test**

Run: `npm run test:unit`
Expected: PASS (6 test mới + 4 test cũ).

- [ ] **Step 5: API + hook + component**

```ts
// frontend/src/api/appVersion.ts
import { Capacitor } from '@capacitor/core'
import api from './axios'
import type { AppVersionInfo } from '@/utils/appVersion'

export const getAppVersion = (app: 'customer' | 'driver') =>
  api
    .get<AppVersionInfo>('/app/version', { params: { app, platform: Capacitor.getPlatform() } })
    .then((r) => r.data)
```

```ts
// frontend/src/hooks/useAppVersionGate.ts
import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { getAppVersion } from '@/api/appVersion'
import { isNativeApp } from '@/platform'
import { evaluateGate, type VersionGate } from '@/utils/appVersion'

/**
 * Kiểm phiên bản lúc mở app và mỗi lần quay lại từ nền. Chỉ chạy trong app native.
 * Phiên bản lấy từ tầng native (App.getInfo) — KHÔNG từ hằng số trong bundle,
 * vì nếu sau này có cập nhật OTA thì hai số sẽ lệch nhau.
 * Mọi lỗi → giữ 'ok' (fail-open): server sập không được khoá người dùng ngoài app.
 */
export function useAppVersionGate(app: 'customer' | 'driver'): VersionGate {
  const [gate, setGate] = useState<VersionGate>({ state: 'ok' })

  useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false

    const check = async () => {
      try {
        const [{ version }, info] = await Promise.all([App.getInfo(), getAppVersion(app)])
        if (!cancelled) setGate(evaluateGate(version, info))
      } catch {
        // fail-open
      }
    }

    void check()
    const sub = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void check()
    })

    return () => {
      cancelled = true
      void sub.then((h) => h.remove())
    }
  }, [app])

  return gate
}
```

```tsx
// frontend/src/components/common/AppVersionGate.tsx
import { useState, type ReactNode } from 'react'
import { useAppVersionGate } from '@/hooks/useAppVersionGate'
import { BRAND } from '@/brand'

// Điều hướng sang URL ngoài: Capacitor chuyển cho hệ thống mở (Play Store / trình duyệt).
const openStore = (url: string) => { window.location.href = url }

export default function AppVersionGate({ app, children }: { app: 'customer' | 'driver'; children: ReactNode }) {
  const gate = useAppVersionGate(app)
  const [dismissed, setDismissed] = useState(false)

  if (gate.state === 'blocked') {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="material-symbols-outlined text-primary text-[56px]">system_update</span>
        <h1 className="text-h2 text-navy font-semibold">Đã có phiên bản mới</h1>
        <p className="text-sm text-neutral-gray">
          Phiên bản {BRAND.name} trên máy bạn đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.
        </p>
        <button onClick={() => openStore(gate.storeUrl)}
          className="min-h-touch w-full max-w-xs rounded-pill bg-primary text-white font-semibold">
          Cập nhật ngay
        </button>
      </div>
    )
  }

  return (
    <>
      {gate.state === 'soft' && !dismissed && (
        <div className="fixed top-0 inset-x-0 z-50 bg-light-green text-navy text-sm px-4 py-2 flex items-center gap-2 shadow-card">
          <span className="flex-1">Có phiên bản mới của {BRAND.name}.</span>
          <button onClick={() => openStore(gate.storeUrl)} className="font-semibold text-primary">Cập nhật</button>
          <button onClick={() => setDismissed(true)} aria-label="Đóng"
            className="material-symbols-outlined text-[18px] text-neutral-gray">close</button>
        </div>
      )}
      {children}
    </>
  )
}
```

`bootstrap.tsx` — bọc `RouterProvider`:
```tsx
        {app === 'admin'
          ? <RouterProvider router={router} />
          : <AppVersionGate app={app}><RouterProvider router={router} /></AppVersionGate>}
```
(import `AppVersionGate` từ `@/components/common/AppVersionGate`.)

- [ ] **Step 6: Admin Settings**

`src/api/settings.ts` — thêm vào `AdminSettings`:
```ts
  app_version_android_customer_min: string
  app_version_android_customer_latest: string
  app_version_android_driver_min: string
  app_version_android_driver_latest: string
```

`src/pages/admin/SettingsPage.tsx`:
- Trong `schema` thêm (trên cùng file đặt `const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Dạng x.y.z, vd 1.2.0')`):
```ts
  app_version_android_customer_min:    semver,
  app_version_android_customer_latest: semver,
  app_version_android_driver_min:      semver,
  app_version_android_driver_latest:   semver,
```
- `defaultValues` thêm 4 khoá giá trị `'1.0.0'`.
- Trước `<Button type="submit"…>` thêm nhóm:
```tsx
        <p className="text-sm font-semibold text-navy mt-2">Phiên bản app Android</p>
        <p className="text-xs text-neutral-gray -mt-1">
          App cũ hơn "tối thiểu" bị chặn và buộc cập nhật; cũ hơn "mới nhất" chỉ được nhắc.
          Chỉ nâng "tối thiểu" khi bản mới đã có trên CH Play.
        </p>
        {([
          ['app_version_android_customer_min', 'App khách — tối thiểu'],
          ['app_version_android_customer_latest', 'App khách — mới nhất'],
          ['app_version_android_driver_min', 'App tài xế — tối thiểu'],
          ['app_version_android_driver_latest', 'App tài xế — mới nhất'],
        ] as const).map(([name, label]) => (
          <div key={name}>
            <label className="text-xs text-neutral-gray mb-1 block">{label}</label>
            <input {...register(name)} placeholder="1.0.0"
              className="w-full border border-border-gray rounded-input px-3 py-2 text-sm outline-none" />
            {errors[name] && <p className="text-danger-red text-xs mt-1">{errors[name]?.message}</p>}
          </div>
        ))}
```
- `onError` của mutation: hiển thị lỗi server nếu có (vd min > latest):
```ts
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
      showToast(msg ?? 'Lưu cài đặt thất bại', 'error')
    },
```

- [ ] **Step 7: Kiểm + commit**

```bash
npm run lint && npm run test:unit && npm run build:admin -- --mode staging && npm run build:driver:native
git add frontend/src/utils/appVersion.ts frontend/src/api/appVersion.ts frontend/src/hooks/useAppVersionGate.ts frontend/src/components/common/AppVersionGate.tsx frontend/tests-unit/appVersion.test.ts frontend/src/bootstrap.tsx frontend/src/api/settings.ts frontend/src/pages/admin/SettingsPage.tsx
git commit -m "feat(frontend): màn buộc cập nhật app native (fail-open) + admin chỉnh phiên bản tối thiểu/mới nhất

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Vỏ Android cho 2 app — plugin, quyền, ký, phiên bản, icon

**Cần trước:** JDK 21. Nếu `/usr/libexec/java_home -v 21` báo lỗi → hỏi người dùng rồi chạy `brew install --cask temurin@21`.

**Files:**
- Modify: `mobile/customer/package.json`, `mobile/customer/package-lock.json`, `mobile/customer/capacitor.config.ts`, `mobile/customer/android/app/build.gradle`, `mobile/customer/android/app/src/main/AndroidManifest.xml`, `mobile/customer/android/app/src/main/res/**`, `mobile/.gitignore`
- Create: `mobile/driver/**` (project mới), `mobile/shared/release.gradle`, `mobile/scripts/check-capacitor-versions.mjs`, `mobile/scripts/render-asset-sources.mjs`, `mobile/assets/*.png`

**Interfaces:**
- Consumes: `dist-native/`, `dist-driver-native/` (Task 7); phiên bản `@capacitor/*` đã ghim (Task 7).
- Produces: `mobile/<app>/android` build được `assembleRelease` / `bundleRelease` khi có `mobile/keystore.properties`; `versionName`/`versionCode` đọc từ `mobile/<app>/package.json`. Kênh âm báo đọc `res/raw/new_ride.mp3` (Makefile chép vào ở Task 14).

- [ ] **Step 1: Script kiểm phiên bản plugin**

```js
// mobile/scripts/check-capacitor-versions.mjs
// Plugin @capacitor/* phải CÙNG phiên bản chính xác ở bundle JS (frontend) và vỏ
// native (mobile/<app>) — lệch là cầu nối JS ↔ native gọi sai chữ ký, lỗi lúc chạy.
import { readFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const front = read('../../frontend/package.json').dependencies
let failed = false

for (const app of ['customer', 'driver']) {
  const shell = read(`../${app}/package.json`).dependencies
  for (const [name, version] of Object.entries(front)) {
    if (!name.startsWith('@capacitor/')) continue
    if (shell[name] !== version) {
      console.error(`✗ ${name}: frontend ${version} ≠ mobile/${app} ${shell[name] ?? '(thiếu)'}`)
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log('✓ Phiên bản @capacitor/* khớp giữa frontend và mobile/*')
```

- [ ] **Step 2: `mobile/customer/package.json`**

```json
{
  "name": "greenca-customer-shell",
  "version": "1.0.0",
  "private": true,
  "description": "Vỏ ứng dụng native (Capacitor) cho app khách hàng GreenCA",
  "dependencies": {
    "@capacitor/android": "<cùng major 8, ghim chính xác>",
    "@capacitor/core": "<Y HỆT frontend>",
    "@capacitor/app": "<Y HỆT frontend>",
    "@capacitor/push-notifications": "<Y HỆT frontend>",
    "@capacitor/share": "<Y HỆT frontend>",
    "@capacitor/status-bar": "<Y HỆT frontend>",
    "@capacitor/splash-screen": "<ghim chính xác, major 8>"
  },
  "devDependencies": {
    "@capacitor/assets": "<ghim chính xác>",
    "@capacitor/cli": "<ghim chính xác, major 8>"
  }
}
```
Điền bằng lệnh (không gõ tay số phiên bản):
```bash
cd $WT/mobile/customer
npm install --save-exact $(node -e "const d=require('../../frontend/package.json').dependencies;console.log(Object.entries(d).filter(([k])=>k.startsWith('@capacitor/')).map(([k,v])=>k+'@'+v).join(' '))") @capacitor/android@^8 @capacitor/splash-screen@^8
npm install --save-exact --save-dev @capacitor/cli@^8 @capacitor/assets@^3
# sửa tay: name, version 1.0.0, description như trên; xoá "typescript" khỏi devDependencies nếu còn
node ../scripts/check-capacitor-versions.mjs   # lỗi vì mobile/driver chưa có — chấp nhận ở bước này
```

- [ ] **Step 3: `mobile/customer/capacitor.config.ts`**

Đổi `webDir: '../../frontend/dist'` → `webDir: '../../frontend/dist-native'`; cập nhật comment build ở đầu file:
```ts
// Build: `make android-customer` (xem docs/MOBILE.md) — build bundle mode native
// vào frontend/dist-native rồi `npx cap sync android`.
```
Thêm sau khối `server`:
```ts
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#F8FAF9', showSpinner: false },
  },
```

- [ ] **Step 4: Gradle dùng chung — `mobile/shared/release.gradle`**

```groovy
// Dùng chung cho mobile/customer và mobile/driver — áp sau plugin com.android.application.
// - Phiên bản đọc từ mobile/<app>/package.json (một nguồn duy nhất, App.getInfo() trả đúng số này).
// - Ký release bằng khoá trong mobile/keystore.properties (KHÔNG commit). Xem docs/MOBILE.md.
import groovy.json.JsonSlurper

def shellPackage = new JsonSlurper().parse(file('../../package.json'))
def versionParts = shellPackage.version.tokenize('.').collect { it as int }
if (versionParts.size() != 3) throw new GradleException("version trong package.json phải dạng x.y.z, đang là ${shellPackage.version}")

def keystorePropsFile = file('../../../keystore.properties')
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) keystorePropsFile.withInputStream { keystoreProps.load(it) }

android {
    defaultConfig {
        versionCode versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        versionName shellPackage.version
    }
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}

gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.name.toLowerCase().contains('release') } && !keystorePropsFile.exists()) {
        throw new GradleException('Thiếu mobile/keystore.properties — xem docs/MOBILE.md mục "Khoá ký"')
    }
}
```
(`file()` trong script được `apply from` phân giải theo thư mục module `app/`: `../../package.json` = `mobile/<app>/package.json`, `../../../keystore.properties` = `mobile/keystore.properties`.)

`mobile/customer/android/app/build.gradle`: xoá 2 dòng `versionCode 1` / `versionName "1.0"`; ngay dưới `apply plugin: 'com.android.application'` thêm `apply from: '../../../shared/release.gradle'`.

- [ ] **Step 5: Quyền + gitignore**

`mobile/customer/android/app/src/main/AndroidManifest.xml` — cạnh `<uses-permission android:name="android.permission.INTERNET" />` thêm:
```xml
    <!-- GPS điền điểm đón (AddressInput) và lọc cuốc gần (TripListPage) -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <!-- Android 13+: phải xin quyền hiện thông báo lúc chạy -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`mobile/.gitignore` thêm:
```
# Khoá ký — KHÔNG BAO GIỜ commit
keystore.properties
*.jks
*.keystore
# Âm báo được Makefile chép từ frontend/public/sounds lúc build
*/android/app/src/main/res/raw/new_ride.mp3
```

- [ ] **Step 6: Nguồn icon/splash từ logo hiện có**

```js
// mobile/scripts/render-asset-sources.mjs
// Sinh ảnh nguồn cho @capacitor/assets từ logo GreenCA (giống public/favicon.svg).
// Dùng Chromium của Playwright có sẵn ở frontend — không thêm thư viện.
// Chạy: node mobile/scripts/render-asset-sources.mjs  → mobile/assets/*.png
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const glyph = (scale, offset) =>
  `<g transform="translate(${offset} ${offset}) scale(${scale})"><path d="M36.29 15.4A15 15 0 1 0 39 24H26" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`
const gradient = `<defs><linearGradient id="g" x1="4" y1="0" x2="44" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#006a36"/><stop offset="1" stop-color="#004d27"/></linearGradient></defs>`
const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">${gradient}${inner}</svg>`

const sources = {
  // Icon đầy đủ (Android < 8 và Play Store)
  'icon-only.png': [1024, svg(1024, `<rect width="48" height="48" fill="url(#g)"/>${glyph(0.78, 5.28)}`)],
  // Adaptive icon: glyph nằm trong vùng an toàn 66% ở giữa
  'icon-foreground.png': [1024, svg(1024, glyph(0.5, 12))],
  'icon-background.png': [1024, svg(1024, `<rect width="48" height="48" fill="url(#g)"/>`)],
  // Splash: tile logo nhỏ giữa nền warm-white
  'splash.png': [2732, svg(2732, `<rect width="48" height="48" fill="#F8FAF9"/><g transform="translate(19 19) scale(0.2083)"><rect width="48" height="48" rx="10.8" fill="url(#g)"/>${glyph(0.78, 5.28)}</g>`)],
}

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, [size, markup]] of Object.entries(sources)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`)
  await page.screenshot({ path: new URL(`../assets/${name}`, import.meta.url).pathname, omitBackground: true })
  console.log('✓', name)
}
await browser.close()
```

```bash
cd $WT && node mobile/scripts/render-asset-sources.mjs
cp mobile/assets/splash.png mobile/assets/splash-dark.png
```
Mở `mobile/assets/icon-only.png` và `splash.png` (Read tool) để nhìn — logo chữ G trắng trên nền xanh, không méo.

- [ ] **Step 7: Dựng `mobile/driver`**

```bash
cd $WT/mobile && mkdir -p driver && cd driver
cp ../customer/package.json package.json
# sửa: "name": "greenca-driver-shell", "description": "Vỏ ứng dụng native (Capacitor) cho app tài xế GreenCA", version 1.0.0
npm ci 2>/dev/null || npm install
```
`mobile/driver/capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli'

// Vỏ ứng dụng native cho app tài xế GreenCA — chỉ nạp bundle web, không chứa logic nghiệp vụ.
// Build: `make android-driver` (xem docs/MOBILE.md).
const config: CapacitorConfig = {
  // KHÔNG đổi được sau khi phát hành lên store — đổi là thành app mới.
  appId: 'vn.greenca.driver',
  appName: 'GreenCA Tài Xế',
  webDir: '../../frontend/dist-driver-native',
  server: {
    androidScheme: 'https',
    // Hostname riêng thay cho `localhost` — xem giải thích CSRF 419 ở mobile/customer/capacitor.config.ts.
    hostname: 'driver-app.greenca.vn',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#F8FAF9', showSpinner: false },
  },
}

export default config
```
```bash
cd $WT/frontend && npm run build:driver:native
cd $WT/mobile/driver && npx cap add android
```
Áp đúng Step 4 (dòng `apply from` + xoá versionCode/versionName) và Step 5 (3 quyền) cho `mobile/driver/android/app/`.

- [ ] **Step 8: Sync, sinh icon, build thử debug**

```bash
cd $WT/frontend && npm run build:customer:native && npm run build:driver:native
for APP in customer driver; do
  cd $WT/mobile/$APP
  npx cap sync android
  npx capacitor-assets generate --android --assetPath ../assets \
    --iconBackgroundColor '#006a36' --splashBackgroundColor '#F8FAF9' --splashBackgroundColorDark '#F8FAF9'
  (cd android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew --no-daemon assembleDebug)
done
node $WT/mobile/scripts/check-capacitor-versions.mjs
```
Expected: 2 file `mobile/<app>/android/app/build/outputs/apk/debug/app-debug.apk`; script in `✓`. Kiểm `grep -h "versionName\|versionCode" mobile/*/android/app/build/intermediates/merged_manifest/debug/*/AndroidManifest.xml` → `1.0.0` / `10000`.

- [ ] **Step 9: Commit**

```bash
cd $WT
git add mobile/.gitignore mobile/shared mobile/scripts mobile/assets mobile/customer mobile/driver
git status --short mobile | grep -E "keystore|\.jks|res/raw/new_ride" && echo "DỪNG: có file bí mật/được sinh trong staging" || true
git commit -m "feat(mobile): vỏ Android cho app khách + app tài xế — plugin, quyền, ký release, phiên bản, icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Âm báo "Green CA, Green CA" (Google Cloud TTS)

**Cần trước (người dùng):** Firebase project đã tạo, đã bật **Cloud Text-to-Speech API**, đã gửi service account JSON. Đặt file ở `~/.greenca/firebase-service-account.json` (ngoài repo, `chmod 600`). Chưa có → dừng task, báo người dùng, làm tiếp Task 14 trước.

**Files:**
- Create: `mobile/scripts/tts-new-ride.mjs`, `frontend/public/sounds/new_ride.mp3`
- Delete: `frontend/public/sounds/.gitkeep`

**Interfaces:**
- Produces: `frontend/public/sounds/new_ride.mp3` — nguồn duy nhất của âm báo (web phát qua `playNewRideSound`, Makefile chép sang `res/raw`).

- [ ] **Step 1: Script tạo giọng (không thư viện ngoài)**

```js
// mobile/scripts/tts-new-ride.mjs
// Sinh các phương án âm báo "Green CA, Green CA" bằng Google Cloud Text-to-Speech.
// Giấy phép Google Cloud TTS cho phép dùng thương mại âm thanh đầu ra (khác giọng
// `say` của macOS — chỉ dùng cá nhân).
//
// Chạy: node mobile/scripts/tts-new-ride.mjs <service-account.json> <thư-mục-ra>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createSign } from 'node:crypto'

const [keyPath, outDir] = process.argv.slice(2)
if (!keyPath || !outDir) { console.error('Cách dùng: node tts-new-ride.mjs <service-account.json> <out-dir>'); process.exit(1) }
const key = JSON.parse(readFileSync(keyPath, 'utf8'))

const b64url = (s) => Buffer.from(s).toString('base64url')
async function accessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  })
  if (!res.ok) throw new Error(`OAuth lỗi ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

const token = await accessToken()
const auth = { Authorization: `Bearer ${token}` }

const voicesRes = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=vi-VN', { headers: auth })
if (!voicesRes.ok) throw new Error(`Liệt kê giọng lỗi ${voicesRes.status}: ${await voicesRes.text()} — đã bật Cloud Text-to-Speech API chưa?`)
const voices = (await voicesRes.json()).voices
  .filter((v) => /Neural2|Wavenet|Chirp/.test(v.name))
  .map((v) => v.name)
console.log('Giọng vi-VN chất lượng cao:', voices.join(', '))

// Cách viết khác nhau để giọng Việt đọc gần "Green CA" nhất. Lặp sẵn 2 lần trong
// file vì Android chỉ phát âm báo một lần.
const spellings = {
  griniay: '<speak>Grin Xi Ây!<break time="350ms"/>Grin Xi Ây!</speak>',
  greenca: '<speak>Green C A!<break time="350ms"/>Green C A!</speak>',
}

mkdirSync(outDir, { recursive: true })
for (const voice of voices) {
  for (const [label, ssml] of Object.entries(spellings)) {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: 'vi-VN', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05, volumeGainDb: 4, sampleRateHertz: 44100 },
      }),
    })
    if (!res.ok) { console.warn(`✗ ${voice}/${label}: ${res.status}`); continue }
    const file = `${outDir}/${voice}__${label}.mp3`
    writeFileSync(file, Buffer.from((await res.json()).audioContent, 'base64'))
    console.log('✓', file)
  }
}
```

- [ ] **Step 2: Sinh phương án**

```bash
OUT=/private/tmp/claude-501/-Users-macbook-Projects-green-car-airport/f921b3ae-0629-4026-8a63-dc6f6c4b9bb6/scratchpad/tts
node $WT/mobile/scripts/tts-new-ride.mjs ~/.greenca/firebase-service-account.json $OUT
ls -la $OUT
```
Expected: nhiều file `<giọng>__<cách viết>.mp3`, mỗi file 2–4 giây (kiểm: `afinfo $OUT/*.mp3 | grep duration`). File > 4 giây → giảm `break` hoặc tăng `speakingRate` rồi chạy lại.

- [ ] **Step 3: Người dùng chọn** — DỪNG, gửi danh sách file và lệnh nghe thử:

```bash
for f in $OUT/*.mp3; do echo "$f"; afplay "$f"; sleep 1; done
```
Nhắc: file chọn là **bản cuối** — kênh `new_ride` khoá âm báo khi app đã cài trên máy người dùng. Chờ người dùng trả lời tên file.

- [ ] **Step 4: Đặt file + commit**

```bash
cp "$OUT/<file người dùng chọn>" $WT/frontend/public/sounds/new_ride.mp3
git rm -q $WT/frontend/public/sounds/.gitkeep
cd $WT && git add mobile/scripts/tts-new-ride.mjs frontend/public/sounds/new_ride.mp3
git commit -m "feat(mobile): âm báo cuốc mới \"Green CA, Green CA\" bằng Google Cloud TTS (<tên giọng>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Khoá ký, `make android-*`, tài liệu

**Cần trước:** JDK 21; `google-services.json` của 2 app (người dùng gửi). Thiếu `google-services.json` → làm Step 1–3, dừng ở Step 4, báo người dùng.

**Files:**
- Modify: `Makefile`, `docs/MOBILE.md`, `docs/DEPLOY.md`, `CLAUDE.md`
- Create (không commit): `~/.greenca/greenca-release.jks`, `mobile/keystore.properties`
- Create (commit): `mobile/customer/android/app/google-services.json`, `mobile/driver/android/app/google-services.json`

**Interfaces:**
- Consumes: Task 12 (`release.gradle`), Task 13 (`new_ride.mp3`).
- Produces: `make android-customer`, `make android-driver` → `dist-mobile/greenca-<app>-<version>.apk` + `.aab`.

- [ ] **Step 1: Tạo keystore**

```bash
mkdir -p ~/.greenca && chmod 700 ~/.greenca
test -f ~/.greenca/greenca-release.jks && { echo "ĐÃ CÓ keystore — KHÔNG tạo lại"; exit 1; }
PASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
"$(/usr/libexec/java_home -v 21)/bin/keytool" -genkeypair -v \
  -keystore ~/.greenca/greenca-release.jks -alias greenca \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=GreenCA, O=GreenCA, L=Ho Chi Minh, C=VN"
cat > $WT/mobile/keystore.properties <<EOF
storeFile=$HOME/.greenca/greenca-release.jks
storePassword=$PASS
keyAlias=greenca
keyPassword=$PASS
EOF
chmod 600 $WT/mobile/keystore.properties ~/.greenca/greenca-release.jks
cd $WT && git check-ignore mobile/keystore.properties   # phải in đường dẫn (đã ignore)
```
**Báo người dùng ngay:** sao lưu `~/.greenca/greenca-release.jks` + `mobile/keystore.properties` vào kho bí mật công ty. Không in mật khẩu ra chat.

- [ ] **Step 2: Makefile** — thêm vào cuối, và thêm `android-customer android-driver android-build` vào `.PHONY`

```make
# ── Android native (Capacitor) ─────────────────────────────────────────────────
# Build trên HOST (Node 22 + JDK 21), không trong container: container frontend
# mount repo chính, build trong đó có thể ra bundle của nhánh khác.
JAVA21 = $(shell /usr/libexec/java_home -v 21 2>/dev/null)
NATIVE_DIST_customer = dist-native
NATIVE_DIST_driver   = dist-driver-native

android-customer:
	@$(MAKE) --no-print-directory android-build APP=customer

android-driver:
	@$(MAKE) --no-print-directory android-build APP=driver

android-build:
	@test -n "$(JAVA21)" || { echo "✗ Thiếu JDK 21: brew install --cask temurin@21"; exit 1; }
	@test -f mobile/keystore.properties || { echo "✗ Thiếu mobile/keystore.properties — docs/MOBILE.md mục Khoá ký"; exit 1; }
	@test -f mobile/$(APP)/android/app/google-services.json || { echo "✗ Thiếu google-services.json cho $(APP) — không có thì app không nhận push"; exit 1; }
	@test -f frontend/public/sounds/new_ride.mp3 || { echo "✗ Thiếu frontend/public/sounds/new_ride.mp3"; exit 1; }
	@test -f frontend/.env.native || { echo "✗ Thiếu frontend/.env.native — docs/MOBILE.md"; exit 1; }
	node mobile/scripts/check-capacitor-versions.mjs
	cd frontend && npm run build:$(APP):native
	@! grep -l "e2e-test-placeholder" frontend/$(NATIVE_DIST_$(APP))/assets/*.js || { echo "✗ Bundle mang key Goong giả của e2e — kiểm frontend/.env"; exit 1; }
	mkdir -p mobile/$(APP)/android/app/src/main/res/raw
	cp frontend/public/sounds/new_ride.mp3 mobile/$(APP)/android/app/src/main/res/raw/new_ride.mp3
	cd mobile/$(APP) && npx cap sync android
	cd mobile/$(APP)/android && JAVA_HOME=$(JAVA21) ./gradlew --no-daemon clean assembleRelease bundleRelease
	mkdir -p dist-mobile
	@V=$$(node -p "require('./mobile/$(APP)/package.json').version"); \
	  cp mobile/$(APP)/android/app/build/outputs/apk/release/app-release.apk dist-mobile/greenca-$(APP)-$$V.apk; \
	  cp mobile/$(APP)/android/app/build/outputs/bundle/release/app-release.aab dist-mobile/greenca-$(APP)-$$V.aab; \
	  echo "✓ dist-mobile/greenca-$(APP)-$$V.apk + .aab"
```

- [ ] **Step 3: Tài liệu**

`docs/MOBILE.md` — đổi "Save Go" → "GreenCA" ở các chỗ nói tên app hiện tại; thêm mục mới ở đầu (trước "1. Máy phát triển"):

````markdown
## 0. Build nhanh

```bash
make android-customer   # → dist-mobile/greenca-customer-<version>.apk + .aab
make android-driver     # → dist-mobile/greenca-driver-<version>.apk + .aab
```

Lần đầu trên máy mới cần:

| Thứ | Ở đâu | Ghi chú |
|---|---|---|
| JDK 21 | `brew install --cask temurin@21` | Chỉ Gradle dùng; Makefile tự tìm bằng `java_home -v 21` |
| `frontend/.env.native` | Tự tạo (gitignore) | Xem nội dung dưới |
| `mobile/keystore.properties` + `~/.greenca/greenca-release.jks` | Lấy từ kho bí mật công ty | **Mất = không bao giờ cập nhật được app trên Play** |
| `google-services.json` | Đã commit trong `mobile/<app>/android/app/` | Tải lại ở Firebase console nếu đổi project |
| `npm ci` | trong `frontend/`, `mobile/customer/`, `mobile/driver/` | |

`frontend/.env.native` (trỏ staging):
```
VITE_API_BASE_URL=https://webco.io.vn
VITE_REVERB_APP_KEY=<giống .env.staging>
VITE_REVERB_HOST=
VITE_REVERB_PORT=
VITE_REVERB_SCHEME=
VITE_DRIVER_APP_URL=https://driver.webco.io.vn
```
Bản production: đổi `VITE_API_BASE_URL=https://greenca.vn`, `VITE_DRIVER_APP_URL=https://driver.greenca.vn`, `VITE_REVERB_APP_KEY` theo `.env.production`.

**Tăng phiên bản:** sửa `version` trong `mobile/<app>/package.json` (x.y.z). `versionCode` tự tính `major*10000 + minor*100 + patch`.

**Cài APK lên máy:** `adb install -r dist-mobile/greenca-driver-1.0.0.apk`, hoặc gửi file qua Zalo/Drive (người nhận bật "Cho phép cài từ nguồn không xác định").

### Khoá ký

Một keystore cho cả 2 app (`~/.greenca/greenca-release.jks`, alias `greenca`). Khi tạo app trên Play Console: **Play App Signing → "Use my own key"** → tải khoá lên bằng công cụ PEPK Google cung cấp. Nhờ vậy bản từ Play và APK gửi Zalo **cùng chữ ký** — cài đè được, không phải gỡ app.

Kiểm chữ ký: `$ANDROID_HOME/build-tools/<bản>/apksigner verify --print-certs dist-mobile/*.apk` — SHA-256 của hai app phải giống nhau.

### Âm báo cuốc mới

Nguồn: `frontend/public/sounds/new_ride.mp3`, tạo bằng `mobile/scripts/tts-new-ride.mjs` (Google Cloud TTS). Makefile chép sang `res/raw/` mỗi lần build. ⚠️ Android **khoá âm báo của kênh** khi kênh đã tạo trên máy — đổi file sau khi đã phát hành thì phải đổi id kênh (`new_ride_v2`) ở cả `src/push/native.ts` lẫn `FcmTransport`.

### Firebase

Project `GreenCA` chứa 2 app Android (`vn.greenca.customer`, `vn.greenca.driver`). Service account JSON chỉ nằm trên server (`FIREBASE_CREDENTIALS`, xem DEPLOY.md) — không commit.
````

`docs/DEPLOY.md` — thêm mục (đặt cạnh phần biến môi trường backend):
```markdown
### Push FCM cho app native (từ nhánh feat/android-native)

1. Đặt service account JSON của Firebase lên server, ngoài thư mục web: `/var/www/secrets/firebase-service-account.json`, `chown root:www-data`, `chmod 640`.
2. `backend/.env`: `FIREBASE_CREDENTIALS=/var/www/secrets/firebase-service-account.json`
3. `composer install --no-dev`, `php artisan migrate` (thêm cột `device_tokens.fcm_token`), `php artisan config:cache`, **restart queue worker** (push đi qua queue).
4. Kiểm: `grep "\[FCM\] Chưa cấu hình" storage/logs/laravel.log` sau khi có thông báo — có dòng này nghĩa là biến chưa ăn.
```

`CLAUDE.md` — trong mục Common Commands thêm:
```bash
# Android native (build trên host, cần JDK 21 — xem docs/MOBILE.md)
make android-customer   # → dist-mobile/*.apk + *.aab
make android-driver
```

- [ ] **Step 4: Đặt `google-services.json`, build release**

```bash
cp <file của người dùng cho customer> $WT/mobile/customer/android/app/google-services.json
cp <file cho driver>                  $WT/mobile/driver/android/app/google-services.json
grep -h '"package_name"' $WT/mobile/*/android/app/google-services.json   # đúng vn.greenca.customer / vn.greenca.driver
cd $WT && make android-customer && make android-driver
ls -la dist-mobile/
BT=$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)
for f in dist-mobile/*.apk; do $BT/apksigner verify --print-certs $f | grep SHA-256; done
```
Expected: 4 file trong `dist-mobile/`; hai dòng SHA-256 **giống nhau**.

- [ ] **Step 5: Commit**

```bash
git add Makefile docs/MOBILE.md docs/DEPLOY.md CLAUDE.md mobile/customer/android/app/google-services.json mobile/driver/android/app/google-services.json
git status --short | grep -E "keystore|\.jks|service-account" && echo "DỪNG: file bí mật" || true
git commit -m "feat(mobile): make android-customer/driver ra APK + AAB đã ký, tài liệu build và deploy FCM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Deploy staging + nghiệm thu emulator và máy thật

**⚠️ Deploy staging là hành động ra ngoài — HỎI người dùng trước** (staging dùng chung). Gợi ý: deploy nhánh `feat/android-native` theo `docs/DEPLOY.md` + mục FCM mới ở Task 14.

**Files:** không sửa code (lỗi tìm thấy → sửa ở task tương ứng, commit riêng `fix(...)`).

- [ ] **Step 1: Deploy staging** (sau khi người dùng đồng ý): backend (migrate, `FIREBASE_CREDENTIALS`, restart worker) + frontend web của nhánh này. Kiểm:

```bash
curl -s 'https://webco.io.vn/api/app/version?app=driver&platform=android'
```
Expected: `{"min_supported":"1.0.0","latest":"1.0.0","store_url":"https://play.google.com/..."}`

- [ ] **Step 2: Emulator**

```bash
SDK=~/Library/Android/sdk
$SDK/cmdline-tools/latest/bin/avdmanager create avd -n greenca36 -k "system-images;android-36;google_apis_playstore;x86_64" -d pixel_7 || true
$SDK/emulator/emulator -avd greenca36 -no-snapshot-load &
$SDK/platform-tools/adb wait-for-device
$SDK/platform-tools/adb install -r dist-mobile/greenca-customer-1.0.0.apk
$SDK/platform-tools/adb install -r dist-mobile/greenca-driver-1.0.0.apk
```
Đăng nhập tài khoản Google trên emulator (Play Services cần để nhận FCM). Log: `adb logcat | grep -iE "Capacitor|Console|FirebaseMessaging"`. DevTools: Chrome `chrome://inspect`.

- [ ] **Step 3: Chạy checklist** — ghi kết quả từng dòng vào báo cáo (✅/❌ + ghi chú):

| # | App | Kịch bản | Kỳ vọng |
|---|---|---|---|
| 1 | Cả 2 | Mở app → splash → đăng nhập PIN | Vào được, không lỗi 419, icon + tên app đúng, status bar xanh chữ trắng |
| 2 | Cả 2 | Vào trang con → bấm Back Android; ở trang gốc → Back | Quay lại trang trước; ở gốc thì thoát app |
| 3 | Cả 2 | Splash/Header/Profile | Không còn nút/banner "Cài đặt ứng dụng" |
| 4 | Cả 2 | Admin đặt `min` = `1.1.0` (`latest` = `1.1.0`) → mở lại app | Màn "Đã có phiên bản mới", không vào được app; nút mở Play |
| 5 | Cả 2 | Admin đặt `min` = `1.0.0`, `latest` = `1.1.0` | Banner nhắc, đóng được |
| 6 | Cả 2 | Bật chế độ máy bay → mở app | Vào app bình thường (fail-open); trả admin về `1.0.0`/`1.0.0` sau bước này |
| 7 | Khách | Đặt xe: gõ địa chỉ (autocomplete Goong), nút vị trí hiện tại (emulator → Extended controls → Location), xem bản đồ lộ trình | Gợi ý hiện; hộp xin quyền vị trí; bản đồ + tuyến vẽ đúng. Lỗi key Goong → ghi lại, thêm `app.greenca.vn`, `driver-app.greenca.vn` vào whitelist Goong |
| 8 | Khách | Profile → Chia sẻ mã giới thiệu; Sao chép link | Khay chia sẻ hệ thống; link dạng `https://webco.io.vn/login?ref=…` (KHÔNG phải `app.greenca.vn`) |
| 9 | Khách | Bấm số hotline | Mở trình gọi điện |
| 10 | Tài xế | Đăng nhập → hộp xin quyền thông báo → Cho phép | `device_tokens` trên staging có dòng `fcm_token`, `platform=android` |
| 11 | Tài xế | Khách đặt xe (web staging) khi app tài xế **đang mở** | Danh sách cuốc cập nhật realtime; toast + tiếng "Green CA" |
| 12 | Tài xế | Như 11 khi app **ở nền** | Thông báo "Có cuốc mới!" kêu "Green CA"; chạm → mở đúng `/driver/trips/<id>` |
| 13 | Tài xế | Như 11 khi app **bị vuốt tắt** | Như 12 |
| 14 | Tài xế | Cài đặt Android → Ứng dụng → GreenCA Tài Xế → Thông báo | Có kênh "Cuốc mới" và "Thông báo chung" |
| 15 | Khách | Tài xế nhận cuốc khi app khách ở nền | Thông báo kênh "Thông báo chung"; chạm → `/customer/booking/<id>` |
| 16 | Tài xế | Đăng xuất → khách đặt xe | Không nhận push; dòng `fcm_token` đã bị xoá |
| 17 | Tài xế | Đăng nhập tài khoản tài xế khác trên cùng máy | Push về đúng tài khoản mới |
| 18 | Web | Mở `https://driver.webco.io.vn` trên Chrome desktop, bật thông báo, đặt cuốc | Web Push vẫn về như trước (không regression) |

Bước 11 không có tiếng → fallback theo spec mục 3: thêm `@capacitor/local-notifications` (cùng phiên bản ở frontend + 2 vỏ), trong `pushNotificationReceived` gọi `LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title: n.title ?? '', body: n.body ?? '', channelId: 'new_ride', extra: n.data }] })` thay cho `playNewRideSound()`; build lại; kiểm lại 11. Commit `fix(frontend): …`.

- [ ] **Step 4: Máy thật** (Xiaomi hoặc Samsung, người dùng mượn): bật Gỡ lỗi USB (docs/MOBILE.md mục 3), `adb install -r` APK tài xế, rồi:
  - Khoá màn hình **30 phút** → khách đặt xe → push về và kêu.
  - Bản đồ mượt; GPS thật đúng vị trí.
  - Nếu không về: ghi lại hãng/ROM và các bước tắt tối ưu pin làm cho nó về (Cài đặt → Pin → GreenCA Tài Xế → Không hạn chế; Tự khởi chạy…) vào `docs/MOBILE.md` mục 3.

- [ ] **Step 5: Commit tài liệu nếu có** (`docs(mobile): …`), báo cáo checklist cho người dùng.

---

### Task 16: Kiểm toàn nhánh trước PR

- [ ] **Step 1: Backend**

Run: `$BE php artisan test`
Expected: PASS toàn bộ, số test = baseline Task 0 + test mới các Task 2–6.

- [ ] **Step 2: Frontend**

```bash
cd $WT/frontend && npm run lint && npm run test:unit
npm run build:customer -- --mode staging && npm run build:driver -- --mode staging && npm run build:admin -- --mode staging
# Bản web vẫn phải chặn khi thiếu VAPID (worktree không có .env.production → mode production chỉ đọc .env):
cp .env /tmp/env.bak && sed -i '' '/^VITE_VAPID_PUBLIC_KEY=/d' .env
npm run build:customer -- --mode production 2>&1 | grep -c "thiếu biến env bắt buộc: VITE_VAPID_PUBLIC_KEY"
cp /tmp/env.bak .env
```
Expected: lint sạch; unit PASS; 3 build OK; lệnh kiểm VAPID in `1`.

- [ ] **Step 3: E2E web** — suite chạy vào container Docker của **repo chính** (đang phục vụ nhánh khác). **Hỏi người dùng** chọn thời điểm: checkout `feat/android-native` ở repo chính (sau khi họ cất việc dở), `make fresh`, `cd frontend && npx playwright test`. Expected: PASS như trên `main`.

- [ ] **Step 4: Review toàn nhánh** — chạy skill `code-review` (theo quy ước dự án: review code do skill code-review), sửa phát hiện, commit.

- [ ] **Step 5: PR** — **hỏi người dùng trước khi push/tạo PR**.

```bash
git push -u origin feat/android-native
gh pr create --base main --title "feat(mobile): bản Android native cho app khách + app tài xế, push FCM" --body "<tóm tắt theo spec + checklist Task 15 + lưu ý deploy FCM>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 17: Đồng bộ với PR #13 (Cuốc Free) — làm ở PR merge SAU

PR #13 (`feat/zalo-free-rides-phase3`) thêm `FreeRideMatchNotification` (đang dùng `WebPushChannel`/`toWebPush`, có `tag` và `data.action = 'open_url'`) và sửa `sw.ts` (tag theo payload, nhánh `open_url`). `PushNotificationContractTest` (Task 5) sẽ **fail** ngay khi hai nhánh gặp nhau — đó là chủ đích.

**Nếu PR #13 merge trước PR này:** rebase `feat/android-native` lên `origin/main`, rồi:

- [ ] **Step 1:** `FreeRideMatchNotification`: `WebPushChannel` → `PushChannel`, `toWebPush` → `toPush`; thêm `'channel' => 'new_ride', 'ttl' => 300` (giữ `'tag' => 'greenca-free-ride'`). Test trong `FreeRideAlertTest`/`FreeRideMergeTest` đang gọi `toWebPush` → `toPush`; thêm assert `channel === 'new_ride'`, `ttl === 300`.
- [ ] **Step 2:** `sw.ts` xung đột: giữ logic `tag: data.tag ?? 'greenca-notification'` + `renotify` của PR #13; phần `notificationclick` dùng `pushRoute()` (đã hỗ trợ `open_url`, Task 8).
- [ ] **Step 3:** Kiểm `zalo://` trong tab Free trên emulator (Task 15 checklist, thêm dòng): bấm nút mở Zalo → mở app Zalo hoặc Play Store trang Zalo. Bị chặn → dùng `@capacitor/app-launcher` (`AppLauncher.openUrl({ url })`) sau một facade, cùng phiên bản ở frontend + 2 vỏ.
- [ ] **Step 4:** `$BE php artisan test` PASS; commit `fix(backend): Cuốc Free dùng PushChannel và kênh new_ride`.

**Nếu PR này merge trước:** áp đúng Step 1–2 trên nhánh `feat/zalo-free-rides-phase3` khi rebase PR #13.
