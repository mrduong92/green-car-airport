# South Telecom ZNS OTP Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp South Telecom làm cổng ZNS để gửi OTP, song song với ZaloZnsService hiện có; bổ sung DLR callback và API admin xem số dư.

**Architecture:** Interface `ZnsSender` làm contract; `AppServiceProvider` bind implementation theo `config('services.zns.provider')`; `OtpController` inject interface thay vì concrete class; DLR nhận callback GET bất đồng bộ từ South Telecom và cập nhật bản ghi `otps`.

**Tech Stack:** Laravel 13 / PHP 8.4 · Laravel HTTP Client (`Http::fake()` trong test) · PHPUnit · RefreshDatabase

## Global Constraints

- Mọi chuỗi hiển thị cho user phải bằng **tiếng Việt** — không dịch sang tiếng Anh.
- Không thêm comment giải thích WHAT — chỉ comment khi WHY không hiển nhiên.
- Không thêm tính năng ngoài spec (SMS Failover không nằm trong phạm vi).
- Chạy test bằng: `docker compose exec app php artisan test --filter=<TestClass>` (hoặc `make test` cho toàn bộ).
- Migration naming: `YYYY_MM_DD_NNNNNN_verb_thing_table.php`.
- PHP 8.4 — dùng `readonly class`, named arguments thoải mái.

---

## File Map

| File | Tác động |
|---|---|
| `app/Services/Zns/ZnsSender.php` | TẠO MỚI — interface |
| `app/Services/Zns/ZnsSendResult.php` | TẠO MỚI — readonly DTO |
| `app/Services/SouthTelecomZnsService.php` | TẠO MỚI |
| `app/Services/ZaloZnsService.php` | SỬA — implement ZnsSender |
| `app/Providers/AppServiceProvider.php` | SỬA — bind ZnsSender |
| `config/services.php` | SỬA — thêm `zns` + `southtelecom_zns` |
| `backend/.env.example` | SỬA — thêm biến mới |
| `database/migrations/2026_06_29_000001_add_zns_fields_to_otps_table.php` | TẠO MỚI |
| `app/Models/Otp.php` | SỬA — fillable + casts |
| `app/Http/Controllers/Auth/OtpController.php` | SỬA — inject ZnsSender |
| `app/Http/Controllers/ZnsDlrController.php` | TẠO MỚI |
| `app/Http/Controllers/Admin/ZnsController.php` | TẠO MỚI |
| `routes/api.php` | SỬA — thêm DLR route + admin route |
| `tests/Feature/ZnsProviderBindingTest.php` | TẠO MỚI |
| `tests/Feature/SouthTelecomZnsServiceTest.php` | TẠO MỚI |
| `tests/Feature/ZaloZnsServiceTest.php` | TẠO MỚI |
| `tests/Feature/OtpSendTest.php` | TẠO MỚI |
| `tests/Feature/ZnsDlrTest.php` | TẠO MỚI |
| `tests/Feature/AdminZnsBalanceTest.php` | TẠO MỚI |

---

### Task 1: Contract + DTO + Config + Provider Binding

**Files:**
- Create: `backend/app/Services/Zns/ZnsSender.php`
- Create: `backend/app/Services/Zns/ZnsSendResult.php`
- Modify: `backend/config/services.php`
- Modify: `backend/.env.example`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Test: `backend/tests/Feature/ZnsProviderBindingTest.php`

**Interfaces:**
- Produces: `ZnsSender::send(string $phone, string $code): ZnsSendResult` và `ZnsSender::getBalance(): ?int` — mọi task sau đều dùng signatures này.
- Produces: `ZnsSendResult` có properties: `bool $success`, `?string $clientReqId`, `?string $trackingId`, `?string $error`.

- [ ] **Step 1: Viết test binding**

  Tạo `backend/tests/Feature/ZnsProviderBindingTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Services\SouthTelecomZnsService;
  use App\Services\ZaloZnsService;
  use App\Services\Zns\ZnsSender;
  use Tests\TestCase;

  class ZnsProviderBindingTest extends TestCase
  {
      public function test_southtelecom_provider_is_resolved_by_default(): void
      {
          config(['services.zns.provider' => 'southtelecom']);
          $sender = app(ZnsSender::class);
          $this->assertInstanceOf(SouthTelecomZnsService::class, $sender);
      }

      public function test_zalo_provider_is_resolved_when_configured(): void
      {
          config(['services.zns.provider' => 'zalo']);
          $sender = app(ZnsSender::class);
          $this->assertInstanceOf(ZaloZnsService::class, $sender);
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=ZnsProviderBindingTest
  ```

  Expected: FAIL — `ZnsSender`, `SouthTelecomZnsService` chưa tồn tại.

- [ ] **Step 3: Tạo thư mục và interface**

  Tạo `backend/app/Services/Zns/ZnsSender.php`:

  ```php
  <?php

  namespace App\Services\Zns;

  interface ZnsSender
  {
      public function send(string $phone, string $code): ZnsSendResult;
      public function getBalance(): ?int;
  }
  ```

- [ ] **Step 4: Tạo DTO**

  Tạo `backend/app/Services/Zns/ZnsSendResult.php`:

  ```php
  <?php

  namespace App\Services\Zns;

  readonly class ZnsSendResult
  {
      public function __construct(
          public bool $success,
          public ?string $clientReqId = null,
          public ?string $trackingId = null,
          public ?string $error = null,
      ) {}
  }
  ```

- [ ] **Step 5: Cập nhật config/services.php**

  Mở `backend/config/services.php`. Thêm hai khối sau vào cuối mảng return (trước dấu `];`):

  ```php
      'zns' => [
          'provider' => env('ZNS_PROVIDER', 'southtelecom'),
      ],

      'southtelecom_zns' => [
          'base_url'    => env('SOUTHTELECOM_ZNS_BASE_URL', 'https://api-04.worldsms.vn/apidebit'),
          'user'        => env('SOUTHTELECOM_ZNS_USER'),
          'password'    => env('SOUTHTELECOM_ZNS_PASSWORD'),
          'from'        => env('SOUTHTELECOM_ZNS_FROM'),
          'template_id' => env('SOUTHTELECOM_ZNS_TEMPLATE_ID'),
          'dlr_token'   => env('SOUTHTELECOM_ZNS_DLR_TOKEN'),
      ],
  ```

- [ ] **Step 6: Cập nhật .env.example**

  Mở `backend/.env.example`. Thêm vào cuối file:

  ```dotenv
  ZNS_PROVIDER=southtelecom

  SOUTHTELECOM_ZNS_BASE_URL=https://api-04.worldsms.vn/apidebit
  SOUTHTELECOM_ZNS_USER=
  SOUTHTELECOM_ZNS_PASSWORD=
  SOUTHTELECOM_ZNS_FROM=
  SOUTHTELECOM_ZNS_TEMPLATE_ID=
  SOUTHTELECOM_ZNS_DLR_TOKEN=
  ```

- [ ] **Step 7: Bind ZnsSender trong AppServiceProvider**

  Mở `backend/app/Providers/AppServiceProvider.php`. Sửa method `register()`:

  ```php
  public function register(): void
  {
      $this->app->bind(\App\Services\Zns\ZnsSender::class, function () {
          return match (config('services.zns.provider')) {
              'zalo'  => app(\App\Services\ZaloZnsService::class),
              default => app(\App\Services\SouthTelecomZnsService::class),
          };
      });
  }
  ```

  Lưu ý: dùng `bind()` không phải `singleton()` — mỗi lần resolve tạo instance mới, cho phép test thay đổi config giữa các test.

- [ ] **Step 8: Chạy lại test — xác nhận PASS (binding)**

  Test binding sẽ pass sau khi Task 2 (SouthTelecomZnsService) và Task 3 (ZaloZnsService refactor) hoàn thành. Tạm thời chạy để xác nhận không có syntax error:

  ```bash
  docker compose exec app php artisan test --filter=ZnsProviderBindingTest
  ```

  Expected: FAIL với "Class SouthTelecomZnsService not found" — đúng, vì service chưa tạo. Không phải lỗi logic.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/app/Services/Zns/ \
          backend/app/Providers/AppServiceProvider.php \
          backend/config/services.php \
          backend/.env.example \
          backend/tests/Feature/ZnsProviderBindingTest.php
  git commit -m "feat: add ZnsSender interface, ZnsSendResult DTO, provider binding"
  ```

---

### Task 2: SouthTelecomZnsService

**Files:**
- Create: `backend/app/Services/SouthTelecomZnsService.php`
- Test: `backend/tests/Feature/SouthTelecomZnsServiceTest.php`

**Interfaces:**
- Consumes: `ZnsSender` (Task 1) — `send(): ZnsSendResult`, `getBalance(): ?int`
- Consumes: `config('services.southtelecom_zns.*')`
- Produces: `SouthTelecomZnsService` — concrete implementation của `ZnsSender`

- [ ] **Step 1: Viết test service**

  Tạo `backend/tests/Feature/SouthTelecomZnsServiceTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Services\SouthTelecomZnsService;
  use Illuminate\Support\Facades\Http;
  use Illuminate\Support\Facades\Log;
  use Tests\TestCase;

  class SouthTelecomZnsServiceTest extends TestCase
  {
      private SouthTelecomZnsService $service;

      protected function setUp(): void
      {
          parent::setUp();
          config([
              'services.southtelecom_zns.base_url'    => 'https://api-04.worldsms.vn/apidebit',
              'services.southtelecom_zns.user'        => 'testuser',
              'services.southtelecom_zns.password'    => 'testpass',
              'services.southtelecom_zns.from'        => 'TEST_OA_ID',
              'services.southtelecom_zns.template_id' => '12345',
          ]);
          $this->service = app(SouthTelecomZnsService::class);
      }

      public function test_send_returns_success_result_when_api_returns_status_1(): void
      {
          Http::fake([
              '*/sendZNS' => Http::response([
                  'status'      => 1,
                  'tracking_id' => 'TRACK-ABC-123',
              ]),
          ]);

          $result = $this->service->send('0901234567', '123456');

          $this->assertTrue($result->success);
          $this->assertSame('TRACK-ABC-123', $result->trackingId);
          $this->assertNotNull($result->clientReqId);
          $this->assertNull($result->error);
      }

      public function test_send_returns_failure_result_when_api_returns_status_0(): void
      {
          Http::fake([
              '*/sendZNS' => Http::response([
                  'status'      => 0,
                  'errorcode'   => 82,
                  'description' => 'Account over quota',
              ]),
          ]);

          $result = $this->service->send('0901234567', '123456');

          $this->assertFalse($result->success);
          $this->assertSame('Account over quota', $result->error);
          $this->assertNotNull($result->clientReqId);
          $this->assertNull($result->trackingId);
      }

      public function test_send_converts_phone_to_international_format(): void
      {
          Http::fake([
              '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
          ]);

          $this->service->send('0901234567', '000000');

          Http::assertSent(function ($request) {
              return $request['to'] === '84901234567';
          });
      }

      public function test_send_includes_dlr_flag_and_client_req_id(): void
      {
          Http::fake([
              '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
          ]);

          $this->service->send('0901234567', '000000');

          Http::assertSent(function ($request) {
              return $request['dlr'] === 1
                  && ! empty($request['client_req_id'])
                  && $request['template_data'] === ['otp' => '000000'];
          });
      }

      public function test_get_balance_returns_integer_on_success(): void
      {
          Http::fake([
              '*/getBalance' => Http::response([
                  'status'      => 1,
                  'errorcode'   => 0,
                  'balance'     => 547050,
                  'description' => 'Get Balance Success',
              ]),
          ]);

          $balance = $this->service->getBalance();

          $this->assertSame(547050, $balance);
      }

      public function test_get_balance_returns_null_on_failure(): void
      {
          Http::fake([
              '*/getBalance' => Http::response([
                  'status'      => 0,
                  'errorcode'   => 40,
                  'description' => 'Unauthorized',
              ]),
          ]);

          $balance = $this->service->getBalance();

          $this->assertNull($balance);
      }

      public function test_send_uses_basic_auth_header(): void
      {
          Http::fake([
              '*/sendZNS' => Http::response(['status' => 1, 'tracking_id' => 'X']),
          ]);

          $this->service->send('0901234567', '000000');

          Http::assertSent(function ($request) {
              $expected = 'Basic ' . base64_encode('testuser:testpass');
              return $request->header('Authorization')[0] === $expected;
          });
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=SouthTelecomZnsServiceTest
  ```

  Expected: FAIL — `SouthTelecomZnsService` chưa tồn tại.

- [ ] **Step 3: Viết SouthTelecomZnsService**

  Tạo `backend/app/Services/SouthTelecomZnsService.php`:

  ```php
  <?php

  namespace App\Services;

  use App\Services\Zns\ZnsSender;
  use App\Services\Zns\ZnsSendResult;
  use Illuminate\Support\Facades\Http;
  use Illuminate\Support\Facades\Log;
  use Illuminate\Support\Str;

  class SouthTelecomZnsService implements ZnsSender
  {
      public function send(string $phone, string $code): ZnsSendResult
      {
          $clientReqId = Str::uuid()->toString();

          $response = Http::withHeaders($this->headers())
              ->post(config('services.southtelecom_zns.base_url') . '/sendZNS', [
                  'from'          => config('services.southtelecom_zns.from'),
                  'to'            => $this->toInternational($phone),
                  'template_id'   => config('services.southtelecom_zns.template_id'),
                  'template_data' => ['otp' => $code],
                  'client_req_id' => $clientReqId,
                  'dlr'           => 1,
              ]);

          $body = $response->json();

          if (($body['status'] ?? 0) !== 1) {
              Log::error('SouthTelecom ZNS send failed', [
                  'phone'       => $phone,
                  'errorcode'   => $body['errorcode'] ?? null,
                  'description' => $body['description'] ?? null,
              ]);

              return new ZnsSendResult(
                  success: false,
                  clientReqId: $clientReqId,
                  error: $body['description'] ?? 'Lỗi không xác định',
              );
          }

          Log::info('SouthTelecom ZNS OTP sent', [
              'phone'       => $phone,
              'tracking_id' => $body['tracking_id'],
          ]);

          return new ZnsSendResult(
              success: true,
              clientReqId: $clientReqId,
              trackingId: $body['tracking_id'],
          );
      }

      public function getBalance(): ?int
      {
          $response = Http::withHeaders($this->headers())
              ->get(config('services.southtelecom_zns.base_url') . '/getBalance');

          $body = $response->json();

          if (($body['status'] ?? 0) !== 1) {
              Log::error('SouthTelecom ZNS getBalance failed', [
                  'errorcode'   => $body['errorcode'] ?? null,
                  'description' => $body['description'] ?? null,
              ]);

              return null;
          }

          return (int) $body['balance'];
      }

      private function headers(): array
      {
          return [
              'Authorization' => 'Basic ' . base64_encode(
                  config('services.southtelecom_zns.user') . ':' . config('services.southtelecom_zns.password')
              ),
              'Content-Type'  => 'application/json',
              'Accept'        => 'application/json',
          ];
      }

      private function toInternational(string $phone): string
      {
          return '84' . ltrim($phone, '0');
      }
  }
  ```

- [ ] **Step 4: Chạy lại test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=SouthTelecomZnsServiceTest
  ```

  Expected: 7 tests, 7 passed.

- [ ] **Step 5: Chạy binding test — xác nhận southtelecom binding PASS**

  ```bash
  docker compose exec app php artisan test --filter=ZnsProviderBindingTest
  ```

  Expected: `test_southtelecom_provider_is_resolved_by_default` PASS. `test_zalo_provider_is_resolved_when_configured` vẫn fail (ZaloZnsService chưa implement interface) — OK, sẽ fix ở Task 3.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/app/Services/SouthTelecomZnsService.php \
          backend/tests/Feature/SouthTelecomZnsServiceTest.php
  git commit -m "feat: add SouthTelecomZnsService with send OTP and getBalance"
  ```

---

### Task 3: ZaloZnsService — Implement ZnsSender

**Files:**
- Modify: `backend/app/Services/ZaloZnsService.php`
- Test: `backend/tests/Feature/ZaloZnsServiceTest.php`

**Interfaces:**
- Consumes: `ZnsSender` (Task 1)
- Produces: `ZaloZnsService implements ZnsSender` — `send()` trả `ZnsSendResult`, `getBalance()` trả `null`

- [ ] **Step 1: Viết test**

  Tạo `backend/tests/Feature/ZaloZnsServiceTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Services\ZaloZnsService;
  use App\Services\Zns\ZnsSender;
  use Illuminate\Support\Facades\Cache;
  use Illuminate\Support\Facades\Http;
  use Illuminate\Support\Facades\Log;
  use Tests\TestCase;

  class ZaloZnsServiceTest extends TestCase
  {
      private ZaloZnsService $service;

      protected function setUp(): void
      {
          parent::setUp();
          config([
              'services.zalo_zns.app_id'       => 'test_app_id',
              'services.zalo_zns.app_secret'    => 'test_secret',
              'services.zalo_zns.refresh_token' => 'test_refresh',
              'services.zalo_zns.template_id'   => '99999',
          ]);
          Cache::forget('zalo_zns_token');
          $this->service = app(ZaloZnsService::class);
      }

      public function test_implements_zns_sender_interface(): void
      {
          $this->assertInstanceOf(ZnsSender::class, $this->service);
      }

      public function test_send_returns_success_result_when_zalo_returns_error_0(): void
      {
          Http::fake([
              '*/access_token'      => Http::response(['access_token' => 'fake_token']),
              '*/message/template'  => Http::response(['error' => 0, 'message' => 'Success']),
          ]);

          $result = $this->service->send('0901234567', '123456');

          $this->assertTrue($result->success);
          $this->assertNotNull($result->clientReqId);
          $this->assertNull($result->error);
      }

      public function test_send_returns_failure_when_zalo_returns_non_zero_error(): void
      {
          Http::fake([
              '*/access_token'     => Http::response(['access_token' => 'fake_token']),
              '*/message/template' => Http::response(['error' => -216, 'message' => 'Template not found']),
          ]);

          $result = $this->service->send('0901234567', '123456');

          $this->assertFalse($result->success);
          $this->assertNotNull($result->clientReqId);
      }

      public function test_send_returns_failure_when_token_cannot_be_obtained(): void
      {
          Http::fake([
              '*/access_token' => Http::response([]),
          ]);

          $result = $this->service->send('0901234567', '123456');

          $this->assertFalse($result->success);
      }

      public function test_get_balance_returns_null(): void
      {
          $this->assertNull($this->service->getBalance());
      }

      public function test_zalo_provider_binding_resolves_correctly(): void
      {
          config(['services.zns.provider' => 'zalo']);
          $sender = app(ZnsSender::class);
          $this->assertInstanceOf(ZaloZnsService::class, $sender);
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=ZaloZnsServiceTest
  ```

  Expected: FAIL — `ZaloZnsService` chưa implement `ZnsSender`.

- [ ] **Step 3: Sửa ZaloZnsService**

  Thay toàn bộ nội dung `backend/app/Services/ZaloZnsService.php`:

  ```php
  <?php

  namespace App\Services;

  use App\Services\Zns\ZnsSender;
  use App\Services\Zns\ZnsSendResult;
  use Illuminate\Support\Facades\Cache;
  use Illuminate\Support\Facades\Http;
  use Illuminate\Support\Facades\Log;
  use Illuminate\Support\Str;

  class ZaloZnsService implements ZnsSender
  {
      private string $oauthUrl = 'https://oauth.zaloapp.com/v4/access_token';
      private string $znsUrl   = 'https://business.openapi.zalo.me/message/template';

      public function send(string $phone, string $code): ZnsSendResult
      {
          $clientReqId = Str::uuid()->toString();
          $token = $this->getAccessToken();

          if (! $token) {
              return new ZnsSendResult(
                  success: false,
                  clientReqId: $clientReqId,
                  error: 'Không lấy được access token',
              );
          }

          $response = Http::withHeaders(['access_token' => $token])
              ->asJson()
              ->post($this->znsUrl, [
                  'phone'         => $this->toInternational($phone),
                  'template_id'   => config('services.zalo_zns.template_id'),
                  'template_data' => ['otp' => $code],
              ]);

          $body = $response->json();

          if (($body['error'] ?? -1) !== 0) {
              Log::error('Zalo ZNS error', ['phone' => $phone, 'response' => $body]);

              return new ZnsSendResult(
                  success: false,
                  clientReqId: $clientReqId,
                  error: $body['message'] ?? 'Lỗi không xác định',
              );
          }

          Log::info('Zalo ZNS OTP sent', ['phone' => $phone]);

          return new ZnsSendResult(
              success: true,
              clientReqId: $clientReqId,
          );
      }

      public function getBalance(): ?int
      {
          return null;
      }

      private function getAccessToken(): ?string
      {
          $cached = Cache::get('zalo_zns_token');
          if ($cached) {
              return $cached;
          }

          $token = $this->refreshAccessToken();
          if ($token) {
              Cache::put('zalo_zns_token', $token, now()->addMinutes(50));
          }

          return $token;
      }

      private function refreshAccessToken(): ?string
      {
          $response = Http::asForm()->post($this->oauthUrl, [
              'grant_type'    => 'refresh_token',
              'app_id'        => config('services.zalo_zns.app_id'),
              'secret_key'    => config('services.zalo_zns.app_secret'),
              'refresh_token' => config('services.zalo_zns.refresh_token'),
          ]);

          $body = $response->json();

          if (empty($body['access_token'])) {
              Log::error('Zalo ZNS token refresh failed', ['response' => $body]);
              return null;
          }

          if (! empty($body['refresh_token'])) {
              $this->persistRefreshToken($body['refresh_token']);
          }

          return $body['access_token'];
      }

      private function persistRefreshToken(string $newToken): void
      {
          $envPath = base_path('.env');

          if (! file_exists($envPath)) {
              return;
          }

          $content = file_get_contents($envPath);
          $updated = preg_replace(
              '/^ZALO_REFRESH_TOKEN=.*/m',
              'ZALO_REFRESH_TOKEN=' . $newToken,
              $content,
          );

          file_put_contents($envPath, $updated);
      }

      private function toInternational(string $phone): string
      {
          return '84' . ltrim($phone, '0');
      }
  }
  ```

- [ ] **Step 4: Chạy test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=ZaloZnsServiceTest
  ```

  Expected: 6 tests, 6 passed.

- [ ] **Step 5: Chạy toàn bộ ZNS binding test**

  ```bash
  docker compose exec app php artisan test --filter=ZnsProviderBindingTest
  ```

  Expected: 2 tests, 2 passed.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/app/Services/ZaloZnsService.php \
          backend/tests/Feature/ZaloZnsServiceTest.php
  git commit -m "refactor: ZaloZnsService implements ZnsSender, send() returns ZnsSendResult"
  ```

---

### Task 4: Migration + Otp Model

**Files:**
- Create: `backend/database/migrations/2026_06_29_000001_add_zns_fields_to_otps_table.php`
- Modify: `backend/app/Models/Otp.php`
- Test: `backend/tests/Feature/OtpZnsFieldsTest.php`

**Interfaces:**
- Produces: Bảng `otps` có thêm 4 cột: `client_req_id`, `tracking_id`, `delivery_status`, `delivered_at`.
- Produces: `Otp::$fillable` và `$casts` cập nhật — các task sau dùng trực tiếp.

- [ ] **Step 1: Viết test**

  Tạo `backend/tests/Feature/OtpZnsFieldsTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\Otp;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Illuminate\Support\Facades\Schema;
  use Tests\TestCase;

  class OtpZnsFieldsTest extends TestCase
  {
      use RefreshDatabase;

      public function test_otps_table_has_zns_columns(): void
      {
          $this->assertTrue(Schema::hasColumn('otps', 'client_req_id'));
          $this->assertTrue(Schema::hasColumn('otps', 'tracking_id'));
          $this->assertTrue(Schema::hasColumn('otps', 'delivery_status'));
          $this->assertTrue(Schema::hasColumn('otps', 'delivered_at'));
      }

      public function test_otp_model_accepts_zns_fields_as_fillable(): void
      {
          $otp = Otp::create([
              'phone'           => '0901234567',
              'code'            => '123456',
              'expires_at'      => now()->addMinutes(5),
              'client_req_id'   => 'uuid-test-123',
              'tracking_id'     => 'TRACK-XYZ',
              'delivery_status' => 'pending',
          ]);

          $this->assertSame('uuid-test-123', $otp->client_req_id);
          $this->assertSame('TRACK-XYZ', $otp->tracking_id);
          $this->assertSame('pending', $otp->delivery_status);
      }

      public function test_delivered_at_is_cast_to_datetime(): void
      {
          $otp = Otp::create([
              'phone'        => '0901234567',
              'code'         => '000000',
              'expires_at'   => now()->addMinutes(5),
              'delivered_at' => '2026-06-29 10:00:00',
          ]);

          $this->assertInstanceOf(\Illuminate\Support\Carbon::class, $otp->delivered_at);
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=OtpZnsFieldsTest
  ```

  Expected: FAIL — cột chưa tồn tại.

- [ ] **Step 3: Tạo migration**

  Tạo `backend/database/migrations/2026_06_29_000001_add_zns_fields_to_otps_table.php`:

  ```php
  <?php

  use Illuminate\Database\Migrations\Migration;
  use Illuminate\Database\Schema\Blueprint;
  use Illuminate\Support\Facades\Schema;

  return new class extends Migration {
      public function up(): void
      {
          Schema::table('otps', function (Blueprint $table) {
              $table->string('client_req_id')->nullable()->index()->after('code');
              $table->string('tracking_id')->nullable()->after('client_req_id');
              $table->string('delivery_status')->nullable()->default('pending')->after('tracking_id');
              $table->timestamp('delivered_at')->nullable()->after('delivery_status');
          });
      }

      public function down(): void
      {
          Schema::table('otps', function (Blueprint $table) {
              $table->dropIndex(['client_req_id']);
              $table->dropColumn(['client_req_id', 'tracking_id', 'delivery_status', 'delivered_at']);
          });
      }
  };
  ```

- [ ] **Step 4: Sửa Otp model**

  Mở `backend/app/Models/Otp.php`. Thay toàn bộ nội dung:

  ```php
  <?php

  namespace App\Models;

  use Illuminate\Database\Eloquent\Model;

  class Otp extends Model
  {
      protected $fillable = [
          'phone',
          'code',
          'expires_at',
          'used_at',
          'client_req_id',
          'tracking_id',
          'delivery_status',
          'delivered_at',
      ];

      protected $casts = [
          'expires_at'   => 'datetime',
          'used_at'      => 'datetime',
          'delivered_at' => 'datetime',
      ];

      public function scopeValid($query)
      {
          return $query->whereNull('used_at')->where('expires_at', '>', now());
      }
  }
  ```

- [ ] **Step 5: Chạy migration**

  ```bash
  docker compose exec app php artisan migrate
  ```

  Expected: `2026_06_29_000001_add_zns_fields_to_otps_table` DONE.

- [ ] **Step 6: Chạy test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=OtpZnsFieldsTest
  ```

  Expected: 3 tests, 3 passed.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/database/migrations/2026_06_29_000001_add_zns_fields_to_otps_table.php \
          backend/app/Models/Otp.php \
          backend/tests/Feature/OtpZnsFieldsTest.php
  git commit -m "feat: add ZNS tracking columns to otps table"
  ```

---

### Task 5: OtpController — Inject ZnsSender

**Files:**
- Modify: `backend/app/Http/Controllers/Auth/OtpController.php`
- Test: `backend/tests/Feature/OtpSendTest.php`

**Interfaces:**
- Consumes: `ZnsSender::send(string $phone, string $code): ZnsSendResult` (Task 1)
- Consumes: Bảng `otps` có `client_req_id`, `tracking_id`, `delivery_status` (Task 4)

- [ ] **Step 1: Viết test**

  Tạo `backend/tests/Feature/OtpSendTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\Otp;
  use App\Services\Zns\ZnsSender;
  use App\Services\Zns\ZnsSendResult;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Tests\TestCase;

  class OtpSendTest extends TestCase
  {
      use RefreshDatabase;

      public function test_send_in_local_env_does_not_call_zns_and_returns_200(): void
      {
          app()->detectEnvironment(fn () => 'local');

          $mock = $this->mock(ZnsSender::class);
          $mock->shouldNotReceive('send');

          $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
              ->assertOk()
              ->assertJson(['message' => 'OTP đã được gửi.']);

          app()->detectEnvironment(fn () => 'testing');
      }

      public function test_send_calls_zns_and_saves_tracking_data_on_success(): void
      {
          $this->mock(ZnsSender::class)
              ->shouldReceive('send')
              ->once()
              ->with('0901234567', \Mockery::type('string'))
              ->andReturn(new ZnsSendResult(
                  success: true,
                  clientReqId: 'uuid-test-1234',
                  trackingId: 'TRACK-XYZ',
              ));

          $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
              ->assertOk()
              ->assertJson(['message' => 'OTP đã được gửi.']);

          $this->assertDatabaseHas('otps', [
              'phone'           => '0901234567',
              'client_req_id'   => 'uuid-test-1234',
              'tracking_id'     => 'TRACK-XYZ',
              'delivery_status' => 'pending',
          ]);
      }

      public function test_send_returns_503_when_zns_fails(): void
      {
          $this->mock(ZnsSender::class)
              ->shouldReceive('send')
              ->once()
              ->andReturn(new ZnsSendResult(success: false, error: 'quota exceeded'));

          $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
              ->assertStatus(503)
              ->assertJson(['message' => 'Không thể gửi OTP. Vui lòng thử lại.']);
      }

      public function test_send_deletes_old_otp_before_creating_new(): void
      {
          Otp::create([
              'phone'      => '0901234567',
              'code'       => '111111',
              'expires_at' => now()->addMinutes(5),
          ]);

          $this->mock(ZnsSender::class)
              ->shouldReceive('send')
              ->once()
              ->andReturn(new ZnsSendResult(success: true, clientReqId: 'x', trackingId: 'y'));

          $this->postJson('/api/auth/otp/send', ['phone' => '0901234567'])
              ->assertOk();

          $this->assertDatabaseCount('otps', 1);
          $this->assertDatabaseMissing('otps', ['code' => '111111']);
      }

      public function test_send_requires_phone(): void
      {
          $this->postJson('/api/auth/otp/send', [])
              ->assertStatus(422);
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=OtpSendTest
  ```

  Expected: FAIL — controller chưa inject `ZnsSender`.

- [ ] **Step 3: Sửa OtpController**

  Thay toàn bộ nội dung `backend/app/Http/Controllers/Auth/OtpController.php`:

  ```php
  <?php

  namespace App\Http\Controllers\Auth;

  use App\Http\Controllers\Controller;
  use App\Models\Otp;
  use App\Models\User;
  use App\Services\Zns\ZnsSender;
  use Illuminate\Http\JsonResponse;
  use Illuminate\Http\Request;
  use Illuminate\Support\Facades\Log;

  class OtpController extends Controller
  {
      public function __construct(private ZnsSender $zns) {}

      public function send(Request $request): JsonResponse
      {
          $request->validate(['phone' => 'required|string|max:20']);

          $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

          Otp::where('phone', $request->phone)->delete();

          $otp = Otp::create([
              'phone'      => $request->phone,
              'code'       => $code,
              'expires_at' => now()->addMinutes(5),
          ]);

          if (app()->environment('local')) {
              Log::info("OTP for {$request->phone}: {$code}");
              return response()->json(['message' => 'OTP đã được gửi.']);
          }

          $result = $this->zns->send($request->phone, $code);

          if (! $result->success) {
              return response()->json(['message' => 'Không thể gửi OTP. Vui lòng thử lại.'], 503);
          }

          $otp->update([
              'client_req_id'   => $result->clientReqId,
              'tracking_id'     => $result->trackingId,
              'delivery_status' => 'pending',
          ]);

          return response()->json(['message' => 'OTP đã được gửi.']);
      }

      public function verify(Request $request): JsonResponse
      {
          $request->validate([
              'phone' => 'required|string|max:20',
              'otp'   => 'required|string|size:6',
          ]);

          $bypass = app()->environment('local') || $request->otp === '000000';

          if (! $bypass) {
              $otp = Otp::where('phone', $request->phone)
                  ->where('code', $request->otp)
                  ->whereNull('used_at')
                  ->where('expires_at', '>', now())
                  ->first();

              if (! $otp) {
                  return response()->json(['message' => 'Mã OTP không hợp lệ hoặc đã hết hạn.'], 422);
              }

              $otp->update(['used_at' => now()]);
          }

          $user = User::firstOrCreate(
              ['phone' => $request->phone],
              ['name' => null, 'role' => 'customer'],
          );

          $token = $user->createToken('api')->plainTextToken;

          return response()->json([
              'user'  => [
                  'id'    => $user->id,
                  'name'  => $user->name,
                  'phone' => $user->phone,
                  'role'  => $user->role,
              ],
              'token' => $token,
          ]);
      }
  }
  ```

- [ ] **Step 4: Chạy test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=OtpSendTest
  ```

  Expected: 5 tests, 5 passed.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/Http/Controllers/Auth/OtpController.php \
          backend/tests/Feature/OtpSendTest.php
  git commit -m "feat: OtpController injects ZnsSender, saves client_req_id and tracking_id"
  ```

---

### Task 6: DLR Callback

**Files:**
- Create: `backend/app/Http/Controllers/ZnsDlrController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/ZnsDlrTest.php`

**Interfaces:**
- Consumes: Bảng `otps` có `client_req_id`, `delivery_status`, `delivered_at` (Task 4)
- Produces: `GET /api/zns/dlr?token=<dlr_token>&smsid=<uuid>&status=<0|1>&deliveredts=<unix>` → 200 hoặc 403

- [ ] **Step 1: Viết test**

  Tạo `backend/tests/Feature/ZnsDlrTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\Otp;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Tests\TestCase;

  class ZnsDlrTest extends TestCase
  {
      use RefreshDatabase;

      private string $token = 'test-dlr-secret-token';

      protected function setUp(): void
      {
          parent::setUp();
          config(['services.southtelecom_zns.dlr_token' => $this->token]);
      }

      private function makeOtp(string $clientReqId = 'uuid-abc-123'): Otp
      {
          return Otp::create([
              'phone'           => '0901234567',
              'code'            => '123456',
              'expires_at'      => now()->addMinutes(5),
              'client_req_id'   => $clientReqId,
              'delivery_status' => 'pending',
          ]);
      }

      public function test_dlr_with_wrong_token_returns_403(): void
      {
          $this->get('/api/zns/dlr?token=wrongtoken&smsid=uuid-abc-123&status=1')
              ->assertStatus(403);
      }

      public function test_dlr_with_status_1_marks_otp_as_delivered(): void
      {
          $this->makeOtp();

          $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1&deliveredts=1700000000")
              ->assertStatus(200)
              ->assertSee('OK');

          $this->assertDatabaseHas('otps', [
              'client_req_id'   => 'uuid-abc-123',
              'delivery_status' => 'delivered',
          ]);
          $this->assertNotNull(Otp::where('client_req_id', 'uuid-abc-123')->value('delivered_at'));
      }

      public function test_dlr_with_status_0_marks_otp_as_failed(): void
      {
          $this->makeOtp();

          $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=0&otterrorcode=53")
              ->assertStatus(200);

          $this->assertDatabaseHas('otps', [
              'client_req_id'   => 'uuid-abc-123',
              'delivery_status' => 'failed',
          ]);
      }

      public function test_dlr_returns_200_even_when_otp_not_found(): void
      {
          $this->get("/api/zns/dlr?token={$this->token}&smsid=nonexistent-uuid&status=1")
              ->assertStatus(200)
              ->assertSee('OK');
      }

      public function test_dlr_can_be_called_multiple_times_for_same_otp(): void
      {
          $this->makeOtp();

          $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1")
              ->assertStatus(200);

          $this->get("/api/zns/dlr?token={$this->token}&smsid=uuid-abc-123&status=1")
              ->assertStatus(200);

          $this->assertDatabaseHas('otps', [
              'client_req_id'   => 'uuid-abc-123',
              'delivery_status' => 'delivered',
          ]);
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=ZnsDlrTest
  ```

  Expected: FAIL — route 404.

- [ ] **Step 3: Tạo ZnsDlrController**

  Tạo `backend/app/Http/Controllers/ZnsDlrController.php`:

  ```php
  <?php

  namespace App\Http\Controllers;

  use App\Models\Otp;
  use Carbon\Carbon;
  use Illuminate\Http\Request;
  use Illuminate\Http\Response;
  use Illuminate\Support\Facades\Log;

  class ZnsDlrController extends Controller
  {
      public function handle(Request $request): Response
      {
          if ($request->query('token') !== config('services.southtelecom_zns.dlr_token')) {
              abort(403);
          }

          $smsid       = $request->query('smsid');
          $status      = (int) $request->query('status', 0);
          $deliveredts = $request->query('deliveredts');

          Log::info('ZNS DLR received', [
              'smsid'        => $smsid,
              'status'       => $status,
              'otterrorcode' => $request->query('otterrorcode'),
          ]);

          $otp = Otp::where('client_req_id', $smsid)->first();

          if ($otp) {
              $otp->update([
                  'delivery_status' => $status === 1 ? 'delivered' : 'failed',
                  'delivered_at'    => $deliveredts ? Carbon::createFromTimestamp((int) $deliveredts) : now(),
              ]);
          }

          return response('OK', 200);
      }
  }
  ```

- [ ] **Step 4: Thêm route vào api.php**

  Mở `backend/routes/api.php`. Thêm import và route vào khu vực `// ── Public ──`:

  Thêm vào dòng import ở đầu file (sau dòng `use App\Http\Controllers\Webhooks\SepayWebhookController;`):
  ```php
  use App\Http\Controllers\ZnsDlrController;
  ```

  Thêm vào khu vực Public (sau dòng `Route::post('/webhooks/sepay', ...)`):
  ```php
  Route::get('/zns/dlr', [ZnsDlrController::class, 'handle']);
  ```

- [ ] **Step 5: Chạy test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=ZnsDlrTest
  ```

  Expected: 5 tests, 5 passed.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/app/Http/Controllers/ZnsDlrController.php \
          backend/routes/api.php \
          backend/tests/Feature/ZnsDlrTest.php
  git commit -m "feat: add ZNS DLR callback endpoint to update OTP delivery status"
  ```

---

### Task 7: Admin Get Balance

**Files:**
- Create: `backend/app/Http/Controllers/Admin/ZnsController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminZnsBalanceTest.php`

**Interfaces:**
- Consumes: `ZnsSender::getBalance(): ?int` (Task 1)
- Produces: `GET /api/admin/zns/balance` → `{ "balance": <int|null> }`

- [ ] **Step 1: Viết test**

  Tạo `backend/tests/Feature/AdminZnsBalanceTest.php`:

  ```php
  <?php

  namespace Tests\Feature;

  use App\Models\User;
  use App\Services\Zns\ZnsSender;
  use Illuminate\Foundation\Testing\RefreshDatabase;
  use Tests\TestCase;

  class AdminZnsBalanceTest extends TestCase
  {
      use RefreshDatabase;

      private function adminUser(): User
      {
          return User::create([
              'phone' => '0999000099',
              'role'  => 'admin',
              'name'  => 'Test Admin',
          ]);
      }

      private function customerUser(): User
      {
          return User::create([
              'phone' => '0999000098',
              'role'  => 'customer',
              'name'  => 'Test Customer',
          ]);
      }

      public function test_admin_can_get_balance(): void
      {
          $this->mock(ZnsSender::class)
              ->shouldReceive('getBalance')
              ->once()
              ->andReturn(547050);

          $this->actingAs($this->adminUser())
              ->getJson('/api/admin/zns/balance')
              ->assertOk()
              ->assertJson(['balance' => 547050]);
      }

      public function test_balance_is_null_when_provider_does_not_support_it(): void
      {
          $this->mock(ZnsSender::class)
              ->shouldReceive('getBalance')
              ->once()
              ->andReturn(null);

          $this->actingAs($this->adminUser())
              ->getJson('/api/admin/zns/balance')
              ->assertOk()
              ->assertJson(['balance' => null]);
      }

      public function test_customer_cannot_access_balance_endpoint(): void
      {
          $this->actingAs($this->customerUser())
              ->getJson('/api/admin/zns/balance')
              ->assertForbidden();
      }

      public function test_unauthenticated_cannot_access_balance_endpoint(): void
      {
          $this->getJson('/api/admin/zns/balance')
              ->assertUnauthorized();
      }
  }
  ```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

  ```bash
  docker compose exec app php artisan test --filter=AdminZnsBalanceTest
  ```

  Expected: FAIL — route 404.

- [ ] **Step 3: Tạo Admin\ZnsController**

  Tạo `backend/app/Http/Controllers/Admin/ZnsController.php`:

  ```php
  <?php

  namespace App\Http\Controllers\Admin;

  use App\Http\Controllers\Controller;
  use App\Services\Zns\ZnsSender;
  use Illuminate\Http\JsonResponse;

  class ZnsController extends Controller
  {
      public function balance(ZnsSender $zns): JsonResponse
      {
          return response()->json(['balance' => $zns->getBalance()]);
      }
  }
  ```

- [ ] **Step 4: Thêm route vào api.php**

  Mở `backend/routes/api.php`. Thêm import (sau dòng `use App\Http\Controllers\Admin\AdminPriceConfigController;`):
  ```php
  use App\Http\Controllers\Admin\ZnsController as AdminZnsController;
  ```

  Thêm vào cuối nhóm `role:admin` (sau dòng `Route::apiResource('/admin/price-configs', ...)`):
  ```php
  Route::get('/admin/zns/balance', [AdminZnsController::class, 'balance']);
  ```

- [ ] **Step 5: Chạy test — xác nhận PASS**

  ```bash
  docker compose exec app php artisan test --filter=AdminZnsBalanceTest
  ```

  Expected: 4 tests, 4 passed.

- [ ] **Step 6: Chạy toàn bộ test suite**

  ```bash
  make test
  ```

  Expected: Tất cả test pass, không có regression.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/app/Http/Controllers/Admin/ZnsController.php \
          backend/routes/api.php \
          backend/tests/Feature/AdminZnsBalanceTest.php
  git commit -m "feat: add admin GET /api/admin/zns/balance endpoint"
  ```

---

## Checklist sau khi hoàn thành

- [ ] Cấu hình `backend/.env` với credentials thực từ South Telecom: `SOUTHTELECOM_ZNS_USER`, `SOUTHTELECOM_ZNS_PASSWORD`, `SOUTHTELECOM_ZNS_FROM`, `SOUTHTELECOM_ZNS_TEMPLATE_ID`, `SOUTHTELECOM_ZNS_DLR_TOKEN`
- [ ] Đăng ký DLR URL với South Telecom: `https://<domain>/api/zns/dlr?token=<dlr_token>`
- [ ] Set `ZNS_PROVIDER=southtelecom` trên môi trường production
