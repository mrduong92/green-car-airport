# SSE Redis Pub/Sub Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế DB polling trong SSE stream bằng Redis pub/sub để driver nhận sự kiện ngay lập tức (~0ms thay vì ~3s).

**Architecture:** `StreamController` giữ connection Redis subscribe mở liên tục; khi có sự kiện, các controller publish lên channel `driver.trips.events`; subscriber nhận và emit SSE ngay lập tức. Heartbeat 5 giây qua `OPT_READ_TIMEOUT` catch.

**Tech Stack:** Laravel 13, phpredis (đã cài sẵn), `Illuminate\Support\Facades\Redis`, PHP 8.4

## Global Constraints

- Tất cả text UI là tiếng Việt — không dịch sang tiếng Anh
- Channel Redis duy nhất: `driver.trips.events` (thay thế `driver.new-booking` cũ)
- Frontend (`useDriverStream.ts`, `TripListPage.tsx`) không được chạm vào
- Route `/api/driver/stream` giữ nguyên
- Auth qua `?token=` query param giữ nguyên

---

## File Map

| File | Thay đổi |
|---|---|
| `backend/app/Http/Controllers/Driver/StreamController.php` | Xóa DB polling loop, thêm Redis subscribe |
| `backend/app/Http/Controllers/Customer/BookingController.php` | Đổi channel name (2 chỗ) |
| `backend/app/Http/Controllers/Driver/TripController.php` | Đổi channel name (1 chỗ) |
| `backend/tests/Feature/SsePublisherTest.php` | Tạo mới — test publisher dùng đúng channel |

---

## Task 1: Chuẩn hóa channel name trong các publisher

**Files:**
- Modify: `backend/app/Http/Controllers/Customer/BookingController.php:94` và `:159`
- Modify: `backend/app/Http/Controllers/Driver/TripController.php:76`
- Create: `backend/tests/Feature/SsePublisherTest.php`

**Interfaces:**
- Produces: channel `driver.trips.events` được dùng nhất quán ở tất cả publisher
- Consumes: không có dependency từ task trước

- [ ] **Step 1: Viết test kiểm tra channel name**

Tạo file `backend/tests/Feature/SsePublisherTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Redis;
use Tests\TestCase;

class SsePublisherTest extends TestCase
{
    use RefreshDatabase;

    private function makeCustomer(): User
    {
        return User::factory()->create(['role' => 'customer', 'pending_penalty' => 0]);
    }

    private function makeDriver(): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        Wallet::create(['user_id' => $driver->id, 'points' => 10_000]);
        return $driver;
    }

    private function makeBooking(User $customer, array $overrides = []): Booking
    {
        return Booking::create(array_merge([
            'customer_id'  => $customer->id,
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
            'discount'     => 0,
            'surcharge'    => 0,
            'status'       => 'finding_driver',
        ], $overrides));
    }

    public function test_booking_store_publishes_new_booking_to_correct_channel(): void
    {
        Notification::fake();
        Redis::spy();

        $customer = $this->makeCustomer();

        $this->actingAs($customer)->postJson('/api/customer/bookings', [
            'pickup'       => 'Hà Nội',
            'destination'  => 'Sân bay Nội Bài',
            'date'         => now()->addDay()->format('Y-m-d'),
            'time'         => '08:00',
            'vehicle_type' => 'sedan_4',
            'distance_km'  => 30,
            'price'        => 300_000,
        ])->assertStatus(201);

        Redis::shouldHaveReceived('publish')
            ->once()
            ->withArgs(function (string $channel, string $payload): bool {
                $data = json_decode($payload, true);
                return $channel === 'driver.trips.events'
                    && $data['type'] === 'new_booking'
                    && isset($data['booking_id']);
            });
    }

    public function test_booking_cancel_publishes_cancelled_to_correct_channel(): void
    {
        Notification::fake();
        Redis::spy();

        $customer = $this->makeCustomer();
        $booking  = $this->makeBooking($customer);

        $this->actingAs($customer)
            ->postJson("/api/customer/bookings/{$booking->id}/cancel")
            ->assertOk();

        Redis::shouldHaveReceived('publish')
            ->once()
            ->withArgs(function (string $channel, string $payload) use ($booking): bool {
                $data = json_decode($payload, true);
                return $channel === 'driver.trips.events'
                    && $data['type'] === 'booking_cancelled'
                    && $data['booking_id'] === $booking->id;
            });
    }

    public function test_trip_accept_publishes_trip_taken_to_correct_channel(): void
    {
        Notification::fake();
        Redis::spy();

        $customer = $this->makeCustomer();
        $driver   = $this->makeDriver();
        $booking  = $this->makeBooking($customer);

        $this->actingAs($driver)
            ->postJson("/api/driver/trips/{$booking->id}/accept")
            ->assertOk();

        Redis::shouldHaveReceived('publish')
            ->once()
            ->withArgs(function (string $channel, string $payload) use ($booking): bool {
                $data = json_decode($payload, true);
                return $channel === 'driver.trips.events'
                    && $data['type'] === 'trip_taken'
                    && $data['booking_id'] === $booking->id;
            });
    }
}
```

- [ ] **Step 2: Chạy test để xác nhận fail (channel name cũ)**

```bash
docker compose exec app php artisan test --filter=SsePublisherTest
```

Expected: 3 tests FAIL với lỗi `driver.trips.events` không được publish, chỉ `driver.new-booking`.

- [ ] **Step 3: Đổi channel name trong BookingController**

Mở `backend/app/Http/Controllers/Customer/BookingController.php`.

Dòng 94, đổi:
```php
Redis::publish('driver.new-booking', json_encode([
```
thành:
```php
Redis::publish('driver.trips.events', json_encode([
```

Dòng 159, đổi:
```php
Redis::publish('driver.new-booking', json_encode([
```
thành:
```php
Redis::publish('driver.trips.events', json_encode([
```

- [ ] **Step 4: Đổi channel name trong TripController**

Mở `backend/app/Http/Controllers/Driver/TripController.php`.

Dòng 76, đổi:
```php
Redis::publish('driver.new-booking', json_encode([
```
thành:
```php
Redis::publish('driver.trips.events', json_encode([
```

- [ ] **Step 5: Chạy test để xác nhận pass**

```bash
docker compose exec app php artisan test --filter=SsePublisherTest
```

Expected:
```
PASS  Tests\Feature\SsePublisherTest
✓ booking store publishes new booking to correct channel
✓ booking cancel publishes cancelled to correct channel
✓ trip accept publishes trip taken to correct channel
```

- [ ] **Step 6: Chạy toàn bộ test suite để kiểm tra regression**

```bash
docker compose exec app php artisan test
```

Expected: tất cả tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/Customer/BookingController.php \
        backend/app/Http/Controllers/Driver/TripController.php \
        backend/tests/Feature/SsePublisherTest.php
git commit -m "refactor: rename SSE channel to driver.trips.events across all publishers"
```

---

## Task 2: Refactor StreamController — thay DB polling bằng Redis subscribe

**Files:**
- Modify: `backend/app/Http/Controllers/Driver/StreamController.php`

**Interfaces:**
- Consumes: channel `driver.trips.events` (từ Task 1)
- Produces: SSE stream giữ nguyên format `data: {...}\n\n`

- [ ] **Step 1: Thay toàn bộ nội dung StreamController**

Ghi đè `backend/app/Http/Controllers/Driver/StreamController.php`:

```php
<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StreamController extends Controller
{
    public function trips(Request $request): StreamedResponse
    {
        // EventSource cannot set custom headers, so auth via ?token= query param
        $pat  = PersonalAccessToken::findToken($request->query('token', ''));
        $user = $pat?->tokenable;

        if (! $user || $user->role !== 'driver') {
            abort(401, 'Unauthorized.');
        }

        return response()->stream(function () use ($user) {
            set_time_limit(0);
            ignore_user_abort(true);
            @ini_set('zlib.output_compression', 0);

            $this->emit(['type' => 'connected', 'driver_id' => $user->id]);

            $maxAt = time() + 300; // 5 min, then EventSource auto-reconnects

            $cfg      = config('database.redis.default');
            $host     = $cfg['host']     ?? '127.0.0.1';
            $port     = (int) ($cfg['port']     ?? 6379);
            $password = $cfg['password'] ?? null;
            $database = (int) ($cfg['database'] ?? 0);

            while (! connection_aborted() && time() < $maxAt) {
                try {
                    // Tạo fresh \Redis() mỗi iteration — sau RedisException
                    // connection cũ bị broken state, không thể reuse
                    $redis = new \Redis();
                    $redis->connect($host, $port, 2.0);
                    if ($password !== null && $password !== 'null') {
                        $redis->auth($password);
                    }
                    if ($database !== 0) {
                        $redis->select($database);
                    }
                    $redis->setOption(\Redis::OPT_READ_TIMEOUT, 5);

                    $redis->subscribe(['driver.trips.events'], function ($r, $channel, $message) use ($maxAt) {
                        $data = json_decode($message, true);
                        if ($data) {
                            $this->emit($data);
                        }
                        // Thoát subscription nếu hết thời gian hoặc client đã ngắt
                        if (connection_aborted() || time() >= $maxAt) {
                            $r->unsubscribe();
                        }
                    });
                } catch (\RedisException) {
                    // OPT_READ_TIMEOUT hit (5s không có message) → gửi heartbeat, rồi subscribe lại
                    if (! connection_aborted()) {
                        echo ": ping\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                    }
                } catch (\Throwable) {
                    // Redis unavailable hoàn toàn → thoát, EventSource tự reconnect sau 3s
                    break;
                }
            }
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
            'Connection'        => 'keep-alive',
        ]);
    }

    private function emit(array $data): void
    {
        echo 'data: ' . json_encode($data) . "\n\n";
        if (ob_get_level() > 0) ob_flush();
        flush();
    }
}
```

- [ ] **Step 2: Chạy toàn bộ test suite**

```bash
docker compose exec app php artisan test
```

Expected: tất cả tests pass (StreamController không bị test trực tiếp do SSE là long-running).

- [ ] **Step 3: Kiểm tra thủ công SSE stream hoạt động**

Mở 2 terminal:

**Terminal 1 — lấy token driver:**
```bash
curl -s -X POST http://localhost:8080/api/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0912345678","otp":"000000"}' | python3 -m json.tool
```
Lưu `token` từ response.

**Terminal 2 — kết nối SSE stream:**
```bash
curl -N "http://localhost:8080/api/driver/stream?token=<TOKEN_Ở_TRÊN>"
```
Expected: in ra `data: {"type":"connected","driver_id":...}` rồi cứ 5s in `: ping`

**Terminal 3 — tạo booking mới:**
```bash
# Lấy token customer trước
CUSTOMER_TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"0901234567","otp":"000000"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST http://localhost:8080/api/customer/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -d '{
    "pickup": "Hà Nội",
    "destination": "Sân bay Nội Bài",
    "date": "2026-07-01",
    "time": "10:00",
    "vehicle_type": "sedan_4",
    "distance_km": 30,
    "price": 300000
  }'
```

Expected ở Terminal 2: xuất hiện ngay `data: {"type":"new_booking","booking_id":...}` — không có delay 3s.

- [ ] **Step 4: Commit**

```bash
git add backend/app/Http/Controllers/Driver/StreamController.php
git commit -m "refactor: replace DB polling with Redis pub/sub in SSE stream"
```

---

## Checklist tự review sau khi hoàn thành

- [ ] Channel name `driver.trips.events` nhất quán ở subscriber và tất cả 3 publisher
- [ ] Import `use App\Models\Booking` đã bị xóa khỏi `StreamController` (không còn query DB)
- [ ] `return false` không còn xuất hiện trong subscribe callback
- [ ] Heartbeat vẫn hoạt động (`: ping` mỗi ~5s khi không có message)
- [ ] Frontend không bị thay đổi
