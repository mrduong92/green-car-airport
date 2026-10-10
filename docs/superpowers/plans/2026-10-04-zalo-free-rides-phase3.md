# Cuốc Free từ nhóm Zalo — Giai đoạn 3: Tab Free trong app tài xế — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tài xế đã duyệt thấy tab **Free** liệt kê cuốc còn hạn (lọc chiều / loại xe / khung giờ / tìm kiếm), cập nhật gần thời gian thực; bấm **"Nhận cuốc"** mở `zalo://qr/p/<mã>` tới trang Zalo người bắn; báo cáo cuốc, ẩn người bắn, báo link lỗi.

**Architecture:** Laravel phục vụ `GET /api/driver/free-rides` (cursor 30 cuốc/trang; `since=<ms>` trả các cuốc đổi từ mốc đó) và 3 thao tác báo cáo/ẩn/link lỗi, sau middleware mới `driver.active`. Khi service đẩy lô cuốc (`POST /internal/zalo/rides`), Laravel xếp job `BroadcastFreeRidesSignal` (duy nhất trong cửa sổ, trễ 2 giây) phát sự kiện nhỏ `free-rides.updated` `{ latest }` trên kênh riêng `driver.free-rides` (Reverb giới hạn 10 KB/tin nhắn). App tài xế chỉ nghe kênh khi đang mở tab Free; nhận tín hiệu thì rải ngẫu nhiên ≤ 3 giây rồi gọi `since=latest` và chèn cuốc mới vào trang đầu (giống `useDriverStream` san tải).

**Tech Stack:** Laravel 13 / PHP 8.4+ (Reverb broadcasting, queue), React 19 + TypeScript + TanStack Query v5 + Tailwind, Laravel Echo, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-04-zalo-free-rides-design.md` — mục 4.4, sơ đồ 6.1, 6.3. **Phụ thuộc:** giai đoạn 2 (bảng `free_rides`, `zalo_sender_blocks`, `zalo_qr_refresh_requests`, endpoint `rides`).

> **Điều chỉnh 05/10 (review giai đoạn 2):** `visibleTo` lọc thêm nhóm bị tắt (`zalo_groups.enabled = false`) — cần `use App\Models\ZaloGroup;` và một test "cuốc của nhóm đã tắt không hiện" trong Task 1.
>
> **Điều chỉnh 04/10 (quyết định GreenCA):** người bắn tắt "Mã QR của tôi" → bỏ qua cuốc. Giai đoạn 2 chỉ gửi sang Laravel cuốc có `qr_code` hợp lệ (cột NOT NULL), nên mọi cuốc trên tab Free đều có `contact_url`. Bỏ trạng thái/nút "Chưa liên hệ được" và các test cuốc `qr_code = null` (giữ kiểm tra mã chữ/số như lớp phòng thủ: mã bẩn → không trả cuốc đó).

## Global Constraints

- Chỉ tài xế `driver_profiles.status = 'active'` xem và thao tác (server chặn bằng `driver.active`; frontend nằm sau `RequireDriverActive` sẵn có).
- Chỉ hiển thị cuốc còn hạn (`expires_at > now`); loại người bắn bị admin chặn và người bắn tài xế đã ẩn.
- Deep link: `zalo://qr/p/<mã>` — mã chỉ gồm chữ/số (`^[A-Za-z0-9]+$`), mã khác dạng coi như chưa có liên hệ.
- Realtime: tín hiệu ≤ 1 lần / ~2 giây toàn hệ thống, payload chỉ `{ latest: number }`; client rải ngẫu nhiên ≤ 3 giây trước khi gọi API; chỉ nghe khi đang mở tab Free.
- Khung giờ lọc tính theo giờ Việt Nam (`Asia/Ho_Chi_Minh`).
- UI tiếng Việt, dùng design token Tailwind sẵn có (`primary`, `navy`, `rounded-card`, `shadow-card`, `min-h-touch`...). Controller trả mảng thuần.

## Quyết định mặc định (GreenCA có thể đổi)

| Câu hỏi | Mặc định | Ghi chú |
| --- | --- | --- |
| Ai xem tab Free | Chỉ tài xế đã duyệt | Muốn mở cho tài xế chờ duyệt làm "mồi" → bỏ `driver.active` ở route + chuyển trang ra ngoài `RequireDriverActive` |
| Menu dưới | Thêm "Free" làm tab thứ 2 (7 tab, mỗi tab ~56px ≥ 48px vùng chạm) | Nếu chật, gom "Thống kê" + "Thông báo" vào sheet "Thêm" như app admin |
| Bộ lọc | Chiều (tiễn/đón/khác), số chỗ, khung giờ (2 giờ tới / hôm nay / ngày mai), tìm kiếm | Chưa có danh mục khu vực |

## Review Focus

1. **Tài xế đã ẩn người bắn A** → cuốc của A biến mất ngay ở trang đầu lẫn lần tải `since` sau đó. Test: `test_hidden_and_blocked_senders_are_excluded` (Task 1) + bước ẩn trong e2e (Task 5).
2. **Mã QR không phải chữ/số** (dữ liệu bẩn) → không sinh `contact_url`, nút hiện "Chưa liên hệ được". Test: `test_contact_url_only_for_safe_codes` (Task 1).
3. **Nhiều lô cuốc tới liên tục** → chỉ một tín hiệu mỗi cửa sổ, không dội Reverb. Test: `test_signal_is_dispatched_once_per_window` (Task 2).
4. **Tài xế chưa duyệt / bị khoá gọi API trực tiếp** → 403. Test: `test_inactive_driver_is_forbidden` (Task 1).
5. **Mất kết nối WebSocket (khoá màn hình) rồi mở lại** → tải lại ngay khi kết nối lại, không chờ tín hiệu kế tiếp. Kiểm chứng ở `useFreeRidesStream` (bind `connected` → resync, Task 3) và bước e2e tải lại trang (Task 5).

## File Structure

**Laravel (`backend/`)**

| File | Trách nhiệm |
| --- | --- |
| `database/migrations/2026_10_07_000001_create_free_ride_driver_tables.php` | `free_ride_reports`, `driver_hidden_senders` |
| `app/Models/FreeRideReport.php`, `app/Models/DriverHiddenSender.php` | Model |
| `app/Http/Middleware/EnsureDriverActive.php` | `driver.active` |
| `app/Http/Controllers/Driver/FreeRideController.php` | Danh sách, báo cáo, ẩn, link lỗi |
| `app/Events/FreeRidesUpdated.php`, `app/Jobs/BroadcastFreeRidesSignal.php`, `app/Broadcasting/DriverFreeRidesChannel.php` | Tín hiệu realtime |
| `routes/api.php`, `routes/channels.php`, `bootstrap/app.php`, `app/Http/Controllers/Webhooks/ZaloServiceController.php` | Nối vào |

**Frontend (`frontend/src/`)**

| File | Trách nhiệm |
| --- | --- |
| `types.d.ts` | `App.FreeRide`, `App.FreeRidePage`, `App.FreeRideFilters` |
| `api/freeRides.ts` | Gọi API |
| `hooks/useFreeRides.ts` | Danh sách (infinite) + tín hiệu realtime + gộp `since` |
| `components/driver/FreeRideCard.tsx`, `components/driver/FreeRideFilters.tsx`, `components/driver/FreeRideActionsSheet.tsx` | Giao diện |
| `pages/driver/FreeRidesPage.tsx` | Trang tab Free |
| `router/driver.tsx`, `layouts/DriverLayout.tsx` | Route + tab |
| `e2e/free-rides.spec.ts`, `e2e/fixtures/freeRides.ts` | Kiểm thử đầu-cuối |

---

### Task 1: Laravel — API danh sách cuốc Free + báo cáo / ẩn / link lỗi

**Files:**
- Create: `backend/database/migrations/2026_10_07_000001_create_free_ride_driver_tables.php`
- Create: `backend/app/Models/FreeRideReport.php`, `backend/app/Models/DriverHiddenSender.php`
- Create: `backend/app/Http/Middleware/EnsureDriverActive.php`
- Modify: `backend/bootstrap/app.php` (alias `driver.active`)
- Create: `backend/app/Http/Controllers/Driver/FreeRideController.php`
- Modify: `backend/routes/api.php` (trong nhóm `Route::middleware('role:driver')->group(...)`)
- Test: `backend/tests/Feature/FreeRideApiTest.php`

**Interfaces:**
- Consumes: `FreeRide`, `ZaloSenderBlock`, `ZaloQrRefreshRequest` (giai đoạn 2).
- Produces:
  - `GET /api/driver/free-rides?direction=&seats=&window=2h|today|tomorrow&q=&since=<ms>&cursor=` → `{ data: FreeRideItem[], next_cursor: string|null, latest: number|null }`. `FreeRideItem = { ride_uid, sender_uid, sender_name, group_name, direction, pickup, destination, pickup_at (ms)|null, pickup_time_text, seats, vehicle_note, price, is_free, is_raw, raw_text, group_count, contact_url (string|null), posted_at (ms), expires_at (ms) }`. Có `since` → các cuốc có `updated_at >= since` (tối đa 200, không phân trang); không có → cursor 30 cuốc mới đăng trước. `latest` = mốc `updated_at` lớn nhất (ms) để client dùng làm `since` lần sau.
  - `POST /api/driver/free-rides/{rideUid}/report` `{ reason: spam|wrong_info|inappropriate|other, note? }` → `{ ok: true }` (một tài xế báo một cuốc một lần — báo lại thì cập nhật).
  - `POST /api/driver/free-rides/hidden-senders` `{ sender_uid }` → `{ ok: true }`.
  - `POST /api/driver/free-rides/{rideUid}/broken-link` → `{ ok: true }` (tạo `zalo_qr_refresh_requests` nếu người bắn chưa có yêu cầu chưa giao).
  - Middleware alias `driver.active` (403 `{ message: 'Tài khoản tài xế chưa được duyệt.' }`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/FreeRideApiTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FreeRideApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-07 01:00:00')); // 08:00 giờ VN
    }

    private function driver(string $status = 'active'): User
    {
        $driver = User::factory()->create(['role' => 'driver']);
        DriverProfile::create([
            'user_id' => $driver->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
            'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
        ]);

        return $driver;
    }

    private function ride(array $overrides = []): FreeRide
    {
        static $n = 0;
        $n++;

        return FreeRide::create(array_merge([
            'ride_uid' => "r-$n", 'sender_uid' => '111', 'sender_name' => 'Đức', 'qr_code' => '758z6tl22yft',
            'zalo_group_id' => 'g1', 'group_name' => 'Taxi Nội Bài', 'direction' => 'to_airport',
            'pickup' => "điểm $n", 'destination' => 'Sân bay Nội Bài', 'pickup_at' => now()->addHour(),
            'pickup_time_text' => '9h', 'seats' => 5, 'price' => 200000, 'is_free' => false, 'is_raw' => false,
            'raw_text' => "tiễn 9h điểm $n", 'group_count' => 1, 'posted_at' => now()->subMinutes(100 - $n),
            'expires_at' => now()->addHours(2),
        ], $overrides));
    }

    public function test_lists_active_rides_newest_first_with_contact_url(): void
    {
        $this->ride(['pickup' => 'cũ']);
        $this->ride(['pickup' => 'mới']);
        $this->ride(['pickup' => 'hết hạn', 'expires_at' => now()->subMinute()]);

        $res = $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->assertOk();

        $this->assertSame(['mới', 'cũ'], array_column($res->json('data'), 'pickup'));
        $this->assertSame('zalo://qr/p/758z6tl22yft', $res->json('data.0.contact_url'));
        $this->assertNotNull($res->json('latest'));
    }

    public function test_filters_by_direction_seats_window_and_search(): void
    {
        $this->ride(['pickup' => 'A', 'direction' => 'to_airport', 'seats' => 5]);
        $this->ride(['pickup' => 'B', 'direction' => 'from_airport', 'seats' => 7]);
        $this->ride(['pickup' => 'C Hà Đông', 'direction' => 'other', 'seats' => 5, 'pickup_at' => now()->addHours(30), 'expires_at' => now()->addHours(31)]);
        $driver = $this->driver();
        $pickups = fn (string $qs) => array_column($this->actingAs($driver, 'sanctum')->getJson("/api/driver/free-rides?$qs")->json('data'), 'pickup');

        $this->assertSame(['B'], $pickups('direction=from_airport'));
        $this->assertSame(['C Hà Đông', 'A'], $pickups('seats=5'));
        $this->assertSame(['C Hà Đông'], $pickups('window=tomorrow'));
        $this->assertSame(['B', 'A'], $pickups('window=2h'));
        // SQLite (test) chỉ không phân biệt hoa thường với chữ ASCII; MySQL production (utf8mb4_unicode_ci) còn bỏ qua dấu.
        $this->assertSame(['C Hà Đông'], $pickups('q='.urlencode('Hà Đông')));
    }

    public function test_since_returns_rides_changed_after_the_mark(): void
    {
        $this->ride(['pickup' => 'trước']);
        $this->travel(1)->seconds(); // updated_at chỉ chính xác tới giây
        $mark = now()->getTimestampMs();
        $this->travel(5)->seconds();
        $this->ride(['pickup' => 'sau']);

        $res = $this->actingAs($this->driver(), 'sanctum')->getJson("/api/driver/free-rides?since=$mark")->assertOk();

        $this->assertSame(['sau'], array_column($res->json('data'), 'pickup'));
        $this->assertNull($res->json('next_cursor'));
    }

    public function test_cursor_pagination(): void
    {
        foreach (range(1, 35) as $i) {
            $this->ride();
        }
        $driver = $this->driver();

        $first = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->assertOk();
        $this->assertCount(30, $first->json('data'));
        $second = $this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides?cursor='.$first->json('next_cursor'))->assertOk();
        $this->assertCount(5, $second->json('data'));
    }

    public function test_hidden_and_blocked_senders_are_excluded(): void
    {
        $this->ride(['sender_uid' => 'hidden', 'pickup' => 'ẩn']);
        $this->ride(['sender_uid' => 'spam', 'pickup' => 'chặn']);
        $this->ride(['sender_uid' => 'ok', 'pickup' => 'hiện']);
        ZaloSenderBlock::create(['sender_uid' => 'spam']);
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => 'hidden'])->assertOk();

        $this->assertSame(['hiện'], array_column($this->actingAs($driver, 'sanctum')->getJson('/api/driver/free-rides')->json('data'), 'pickup'));
        // Tài xế khác vẫn thấy cuốc của người bắn mà tài xế này ẩn
        $this->assertCount(2, $this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'));
    }

    public function test_contact_url_only_for_safe_codes(): void
    {
        $this->ride(['qr_code' => null, 'pickup' => 'không mã']);
        $this->ride(['qr_code' => 'abc/../x', 'pickup' => 'mã bẩn']);

        $data = collect($this->actingAs($this->driver(), 'sanctum')->getJson('/api/driver/free-rides')->json('data'))->keyBy('pickup');

        $this->assertNull($data['không mã']['contact_url']);
        $this->assertNull($data['mã bẩn']['contact_url']);
    }

    public function test_report_and_broken_link(): void
    {
        $ride = $this->ride();
        $driver = $this->driver();

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/report", ['reason' => 'spam'])->assertOk();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/report", ['reason' => 'wrong_info'])->assertOk();
        $this->assertDatabaseCount('free_ride_reports', 1);
        $this->assertDatabaseHas('free_ride_reports', ['free_ride_uid' => $ride->ride_uid, 'reason' => 'wrong_info']);

        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/broken-link")->assertOk();
        $this->actingAs($driver, 'sanctum')->postJson("/api/driver/free-rides/{$ride->ride_uid}/broken-link")->assertOk();
        $this->assertSame(1, ZaloQrRefreshRequest::where('sender_uid', '111')->whereNull('delivered_at')->count());

        $this->actingAs($driver, 'sanctum')->postJson('/api/driver/free-rides/khong-co/report', ['reason' => 'spam'])->assertNotFound();
    }

    public function test_inactive_driver_is_forbidden(): void
    {
        $this->actingAs($this->driver('pending'), 'sanctum')->getJson('/api/driver/free-rides')->assertForbidden();
        $this->actingAs($this->driver('blocked'), 'sanctum')->postJson('/api/driver/free-rides/hidden-senders', ['sender_uid' => 'x'])->assertForbidden();
        $this->actingAs(User::factory()->create(['role' => 'customer']), 'sanctum')->getJson('/api/driver/free-rides')->assertForbidden();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=FreeRideApiTest`
Expected: FAIL — 404 (route chưa có) / bảng `free_ride_reports` chưa có

- [ ] **Step 3: Implement**

`backend/database/migrations/2026_10_07_000001_create_free_ride_driver_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Lưu theo ride_uid (không FK) vì free_rides bị dọn sau khi hết hạn — báo cáo vẫn còn để admin xem.
        Schema::create('free_ride_reports', function (Blueprint $table) {
            $table->id();
            $table->string('free_ride_uid', 64)->index();
            $table->string('sender_uid', 32)->index();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 32);
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['driver_id', 'free_ride_uid']);
        });

        Schema::create('driver_hidden_senders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->string('sender_uid', 32);
            $table->timestamps();

            $table->unique(['driver_id', 'sender_uid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_hidden_senders');
        Schema::dropIfExists('free_ride_reports');
    }
};
```

`backend/app/Models/FreeRideReport.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FreeRideReport extends Model
{
    protected $guarded = [];
}
```

`backend/app/Models/DriverHiddenSender.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DriverHiddenSender extends Model
{
    protected $guarded = [];
}
```

`backend/app/Http/Middleware/EnsureDriverActive.php`:

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Chỉ tài xế đã duyệt (driver_profiles.status = active). Đặt sau 'role:driver'.
class EnsureDriverActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user?->role !== 'driver' || $user->driverProfile?->status !== 'active') {
            return response()->json(['message' => 'Tài khoản tài xế chưa được duyệt.'], 403);
        }

        return $next($request);
    }
}
```

`backend/bootstrap/app.php` — thêm import `use App\Http\Middleware\EnsureDriverActive;` và alias:

```php
            'driver.active' => EnsureDriverActive::class,
```

`backend/app/Http/Controllers/Driver/FreeRideController.php`:

```php
<?php

namespace App\Http\Controllers\Driver;

use App\Http\Controllers\Controller;
use App\Models\DriverHiddenSender;
use App\Models\FreeRide;
use App\Models\FreeRideReport;
use App\Models\ZaloQrRefreshRequest;
use App\Models\ZaloSenderBlock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

// Tab Free: cuốc lấy từ nhóm Zalo. GreenCA chỉ là trung gian — "Nhận cuốc" mở Zalo người bắn.
class FreeRideController extends Controller
{
    private const PAGE_SIZE = 30;

    private const SINCE_LIMIT = 200;

    private const TZ = 'Asia/Ho_Chi_Minh';

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['nullable', 'in:to_airport,from_airport,other'],
            'seats'     => ['nullable', 'integer', 'min:1', 'max:60'],
            'window'    => ['nullable', 'in:2h,today,tomorrow'],
            'q'         => ['nullable', 'string', 'max:100'],
            'since'     => ['nullable', 'integer', 'min:0'],
            'cursor'    => ['nullable', 'string'],
        ]);

        // Lấy mốc trước khi truy vấn: cuốc chèn trong lúc truy vấn sẽ rơi vào lần since kế tiếp.
        $latestBefore = FreeRide::max('updated_at');
        $query = $this->visibleTo($request->user()->id, $data);

        if (isset($data['since'])) {
            // >= vì updated_at chỉ chính xác tới giây; client gộp theo ride_uid nên trả trùng không sao.
            $rides = $query->where('updated_at', '>=', Carbon::createFromTimestampMs($data['since']))
                ->orderByDesc('updated_at')->limit(self::SINCE_LIMIT)->get();

            return response()->json([
                'data'        => $rides->map(fn (FreeRide $r) => $this->format($r))->values(),
                'next_cursor' => null,
                'latest'      => $this->latestOf($rides, (int) $data['since']),
            ]);
        }

        $page = $query->orderByDesc('posted_at')->orderByDesc('id')->cursorPaginate(self::PAGE_SIZE);

        return response()->json([
            'data'        => collect($page->items())->map(fn (FreeRide $r) => $this->format($r))->values(),
            'next_cursor' => $page->nextCursor()?->encode(),
            'latest'      => $latestBefore ? Carbon::parse($latestBefore)->getTimestampMs() : null,
        ]);
    }

    public function report(Request $request, string $rideUid): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'in:spam,wrong_info,inappropriate,other'],
            'note'   => ['nullable', 'string', 'max:255'],
        ]);
        $ride = FreeRide::where('ride_uid', $rideUid)->firstOrFail();

        FreeRideReport::updateOrCreate(
            ['driver_id' => $request->user()->id, 'free_ride_uid' => $ride->ride_uid],
            ['sender_uid' => $ride->sender_uid, 'reason' => $data['reason'], 'note' => $data['note'] ?? null],
        );

        return response()->json(['ok' => true]);
    }

    public function hideSender(Request $request): JsonResponse
    {
        $data = $request->validate(['sender_uid' => ['required', 'string', 'max:32']]);

        DriverHiddenSender::firstOrCreate(['driver_id' => $request->user()->id, 'sender_uid' => $data['sender_uid']]);

        return response()->json(['ok' => true]);
    }

    public function brokenLink(Request $request, string $rideUid): JsonResponse
    {
        $ride = FreeRide::where('ride_uid', $rideUid)->firstOrFail();

        // Một yêu cầu chưa giao cho mỗi người bắn là đủ — service lấy lại mã một lần.
        $pending = ZaloQrRefreshRequest::where('sender_uid', $ride->sender_uid)->whereNull('delivered_at')->exists();
        if (! $pending) {
            ZaloQrRefreshRequest::create(['sender_uid' => $ride->sender_uid, 'requested_by' => $request->user()->id]);
        }

        return response()->json(['ok' => true]);
    }

    private function visibleTo(int $driverId, array $data): Builder
    {
        $query = FreeRide::query()
            ->where('expires_at', '>', now())
            ->whereNotIn('sender_uid', ZaloSenderBlock::select('sender_uid'))
            // Nhóm admin đã tắt: ẩn cả cuốc đã đồng bộ trước khi tắt / lúc service chưa lấy được cấu hình.
            ->whereNotIn('zalo_group_id', ZaloGroup::where('enabled', false)->select('zalo_group_id'))
            ->whereNotIn('sender_uid', DriverHiddenSender::where('driver_id', $driverId)->select('sender_uid'))
            ->when($data['direction'] ?? null, fn (Builder $q, string $d) => $q->where('direction', $d))
            ->when($data['seats'] ?? null, fn (Builder $q, $s) => $q->where('seats', (int) $s));

        if (! empty($data['q'])) {
            $like = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(fn (Builder $w) => $w->where('pickup', 'like', $like)
                ->orWhere('destination', 'like', $like)
                ->orWhere('raw_text', 'like', $like));
        }

        $nowVn = now(self::TZ);
        match ($data['window'] ?? null) {
            '2h'       => $query->whereBetween('pickup_at', [now()->subMinutes(30), now()->addHours(2)]),
            'today'    => $query->whereBetween('pickup_at', [now()->subMinutes(30), $nowVn->copy()->endOfDay()->utc()]),
            'tomorrow' => $query->whereBetween('pickup_at', [$nowVn->copy()->addDay()->startOfDay()->utc(), $nowVn->copy()->addDay()->endOfDay()->utc()]),
            default    => null,
        };

        return $query;
    }

    private function format(FreeRide $r): array
    {
        $code = $r->qr_code !== null && preg_match('/^[A-Za-z0-9]+$/', $r->qr_code) ? $r->qr_code : null;

        return [
            'ride_uid'         => $r->ride_uid,
            'sender_uid'       => $r->sender_uid,
            'sender_name'      => $r->sender_name,
            'group_name'       => $r->group_name,
            'direction'        => $r->direction,
            'pickup'           => $r->pickup,
            'destination'      => $r->destination,
            'pickup_at'        => $r->pickup_at?->getTimestampMs(),
            'pickup_time_text' => $r->pickup_time_text,
            'seats'            => $r->seats,
            'vehicle_note'     => $r->vehicle_note,
            'price'            => $r->price,
            'is_free'          => $r->is_free,
            'is_raw'           => $r->is_raw,
            'raw_text'         => $r->raw_text,
            'group_count'      => $r->group_count,
            'contact_url'      => $code ? "zalo://qr/p/{$code}" : null,
            'posted_at'        => $r->posted_at->getTimestampMs(),
            'expires_at'       => $r->expires_at->getTimestampMs(),
        ];
    }

    private function latestOf(Collection $rides, int $fallback): int
    {
        $max = $rides->max(fn (FreeRide $r) => $r->updated_at->getTimestampMs());

        return $max ?? $fallback;
    }
}
```

`backend/routes/api.php` — thêm `use App\Http\Controllers\Driver\FreeRideController;` và trong nhóm `Route::middleware('role:driver')->group(function () { ... })`:

```php
        // Tab Free (cuốc từ nhóm Zalo) — chỉ tài xế đã duyệt.
        Route::middleware('driver.active')->group(function () {
            Route::get('/driver/free-rides', [FreeRideController::class, 'index']);
            Route::post('/driver/free-rides/hidden-senders', [FreeRideController::class, 'hideSender']);
            Route::post('/driver/free-rides/{rideUid}/report', [FreeRideController::class, 'report']);
            Route::post('/driver/free-rides/{rideUid}/broken-link', [FreeRideController::class, 'brokenLink']);
        });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T app php artisan test --filter=FreeRideApiTest`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_10_07_000001_create_free_ride_driver_tables.php backend/app/Models/FreeRideReport.php backend/app/Models/DriverHiddenSender.php backend/app/Http/Middleware/EnsureDriverActive.php backend/bootstrap/app.php backend/app/Http/Controllers/Driver/FreeRideController.php backend/routes/api.php backend/tests/Feature/FreeRideApiTest.php
git commit -m "feat(free-rides): API danh sách cuốc Free cho tài xế đã duyệt — lọc, since, cursor; báo cáo, ẩn người bắn, link lỗi"
```

---

### Task 2: Laravel — tín hiệu realtime `free-rides.updated`

**Files:**
- Create: `backend/app/Events/FreeRidesUpdated.php`
- Create: `backend/app/Jobs/BroadcastFreeRidesSignal.php`
- Create: `backend/app/Broadcasting/DriverFreeRidesChannel.php`
- Modify: `backend/routes/channels.php`
- Modify: `backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` (method `rides`)
- Test: `backend/tests/Feature/FreeRidesSignalTest.php`

**Interfaces:**
- Consumes: `POST /internal/zalo/rides` (giai đoạn 2), `FreeRide`.
- Produces:
  - Kênh private `driver.free-rides` (chỉ tài xế active), sự kiện `free-rides.updated` payload `{ latest: number }` (ms). Task 3 nghe đúng tên này (`.free-rides.updated`).
  - Job `BroadcastFreeRidesSignal` (`ShouldQueue`, `ShouldBeUniqueUntilProcessing`, `uniqueFor = 10`), xếp với `delay(2 giây)` sau mỗi lô có cuốc.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/FreeRidesSignalTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Broadcasting\DriverFreeRidesChannel;
use App\Events\FreeRidesUpdated;
use App\Jobs\BroadcastFreeRidesSignal;
use App\Models\DriverProfile;
use App\Models\FreeRide;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SignsZaloBotRequests;
use Tests\TestCase;

class FreeRidesSignalTest extends TestCase
{
    use RefreshDatabase;
    use SignsZaloBotRequests;

    protected function setUp(): void
    {
        parent::setUp();
        config(['zalo.enabled' => true, 'zalo.bot_secret' => 'test-secret']);
        $this->travelTo(Carbon::parse('2026-10-07 01:00:00'));
    }

    private function ridePayload(string $uid): array
    {
        return [
            'ride_uid' => $uid, 'sender_uid' => '111', 'sender_name' => '', 'qr_code' => null, 'zalo_group_id' => 'g1', 'group_name' => '',
            'direction' => null, 'pickup' => null, 'destination' => null, 'pickup_at' => null, 'pickup_time_text' => null,
            'seats' => null, 'vehicle_note' => null, 'price' => null, 'is_free' => false, 'is_raw' => true, 'raw_text' => 'x',
            'group_count' => 1, 'posted_at' => now()->getTimestampMs(), 'expires_at' => now()->addHour()->getTimestampMs(),
        ];
    }

    public function test_signal_is_dispatched_once_per_window(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$this->ridePayload('a')]])->assertOk();
        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [$this->ridePayload('b')]])->assertOk();

        Queue::assertPushed(BroadcastFreeRidesSignal::class, 1);
    }

    public function test_no_signal_when_nothing_was_stored(): void
    {
        Queue::fake();

        $this->zaloPost('/api/internal/zalo/rides', ['rides' => [['ride_uid' => 'bad']]])->assertOk();

        Queue::assertNotPushed(BroadcastFreeRidesSignal::class);
    }

    public function test_job_broadcasts_latest_mark(): void
    {
        Event::fake([FreeRidesUpdated::class]);
        FreeRide::create(['ride_uid' => 'a', 'sender_uid' => '111', 'zalo_group_id' => 'g1', 'raw_text' => 'x', 'posted_at' => now(), 'expires_at' => now()->addHour()]);

        (new BroadcastFreeRidesSignal)->handle();

        Event::assertDispatched(FreeRidesUpdated::class, fn (FreeRidesUpdated $e) => $e->latest === now()->getTimestampMs());
    }

    public function test_event_shape(): void
    {
        $event = new FreeRidesUpdated(123);

        $this->assertSame('private-driver.free-rides', $event->broadcastOn()->name);
        $this->assertSame('free-rides.updated', $event->broadcastAs());
        $this->assertSame(['latest' => 123], $event->broadcastWith());
    }

    public function test_channel_allows_only_active_drivers(): void
    {
        $make = function (string $role, ?string $status) {
            $user = User::factory()->create(['role' => $role]);
            if ($status) {
                DriverProfile::create([
                    'user_id' => $user->id, 'vehicle_make' => 'Toyota', 'vehicle_model' => 'Vios', 'vehicle_plate' => '30A-'.random_int(10000, 99999),
                    'vehicle_year' => 2021, 'vehicle_color' => 'Trắng', 'vehicle_type' => 'sedan_4', 'status' => $status,
                ]);
            }

            return $user;
        };
        $channel = new DriverFreeRidesChannel;

        $this->assertTrue($channel->join($make('driver', 'active')));
        $this->assertFalse($channel->join($make('driver', 'pending')));
        $this->assertFalse($channel->join($make('customer', null)));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T app php artisan test --filter=FreeRidesSignalTest`
Expected: FAIL — `Class "App\Jobs\BroadcastFreeRidesSignal" not found`

- [ ] **Step 3: Implement**

`backend/app/Events/FreeRidesUpdated.php`:

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Tín hiệu "có cuốc Free mới" — chỉ mang mốc thời gian. Reverb giới hạn 10 KB/tin nhắn nên KHÔNG gửi
 * danh sách cuốc; app tự gọi GET /driver/free-rides?since=latest theo bộ lọc của mình.
 * ShouldBroadcastNow vì đã chạy trong job BroadcastFreeRidesSignal (không xếp hàng thêm lần nữa).
 */
class FreeRidesUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $latest) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('driver.free-rides');
    }

    public function broadcastAs(): string
    {
        return 'free-rides.updated';
    }

    /** @return array<string, int> */
    public function broadcastWith(): array
    {
        return ['latest' => $this->latest];
    }
}
```

`backend/app/Jobs/BroadcastFreeRidesSignal.php`:

```php
<?php

namespace App\Jobs;

use App\Events\FreeRidesUpdated;
use App\Models\FreeRide;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Carbon;

/**
 * Gom tín hiệu: service đẩy lô mỗi 2 giây, job được xếp với delay 2 giây và là DUY NHẤT tới khi bắt đầu chạy —
 * các lô tới trong cửa sổ đó không xếp thêm job, nên toàn hệ thống phát ≤ ~1 tín hiệu / 2 giây.
 */
class BroadcastFreeRidesSignal implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $uniqueFor = 10;

    public function handle(): void
    {
        $latest = FreeRide::max('updated_at');
        if ($latest === null) {
            return;
        }

        event(new FreeRidesUpdated(Carbon::parse($latest)->getTimestampMs()));
    }
}
```

`backend/app/Broadcasting/DriverFreeRidesChannel.php`:

```php
<?php

namespace App\Broadcasting;

use App\Models\User;

// Kênh tab Free: chỉ tài xế đã duyệt (khớp middleware driver.active của API).
class DriverFreeRidesChannel
{
    public function join(User $user): bool
    {
        return $user->role === 'driver' && $user->driverProfile?->status === 'active';
    }
}
```

`backend/routes/channels.php` — thêm `use App\Broadcasting\DriverFreeRidesChannel;` và:

```php
Broadcast::channel('driver.free-rides', DriverFreeRidesChannel::class);
```

`backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` — thêm `use App\Jobs\BroadcastFreeRidesSignal;`, sửa method `rides`:

```php
    public function rides(Request $request, ZaloRideIngestService $service): JsonResponse
    {
        $data = $request->validate([
            'rides' => ['required', 'array', 'max:'.config('zalo.max_rides_batch')],
        ]);

        $result = $service->ingest($data['rides']);
        if ($result['stored'] > 0) {
            BroadcastFreeRidesSignal::dispatch()->delay(now()->addSeconds(2));
        }

        return response()->json($result);
    }
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec -T app php artisan test --filter='FreeRidesSignalTest|ZaloRideIngestTest|FreeRideApiTest'`
Expected: PASS. Nếu `test_signal_is_dispatched_once_per_window` đếm 2 (khoá duy nhất không áp dụng với `Queue::fake()` trên bản Laravel đang dùng), chuyển test sang kiểm khoá trực tiếp: dispatch 2 lần với queue `sync`/`database` và đếm job trong bảng `jobs` — ghi ruling.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Events/FreeRidesUpdated.php backend/app/Jobs/BroadcastFreeRidesSignal.php backend/app/Broadcasting/DriverFreeRidesChannel.php backend/routes/channels.php backend/app/Http/Controllers/Webhooks/ZaloServiceController.php backend/tests/Feature/FreeRidesSignalTest.php
git commit -m "feat(free-rides): tín hiệu realtime free-rides.updated gom mỗi ~2 giây trên kênh riêng cho tài xế đã duyệt"
```

---

### Task 3: Frontend — kiểu dữ liệu, API, hook danh sách + realtime

**Files:**
- Modify: `frontend/src/types.d.ts` (trong `declare namespace App`)
- Create: `frontend/src/api/freeRides.ts`
- Create: `frontend/src/hooks/useFreeRides.ts`

**Interfaces:**
- Consumes: API Task 1, kênh/sự kiện Task 2, `getEcho` (`frontend/src/echo.ts`), `useAuthStore`.
- Produces:
  - `App.FreeRide` (đúng `FreeRideItem` Task 1), `App.FreeRidePage = { data: App.FreeRide[]; next_cursor: string | null; latest: number | null }`, `App.FreeRideFilters = { direction?: 'to_airport' | 'from_airport' | 'other'; seats?: number; window?: '2h' | 'today' | 'tomorrow'; q?: string }`.
  - `getFreeRides(params: App.FreeRideFilters & { since?: number; cursor?: string })`, `reportFreeRide(rideUid, reason, note?)`, `hideFreeRideSender(senderUid)`, `reportBrokenLink(rideUid)`.
  - `useFreeRides(filters)` → `{ rides: App.FreeRide[]; isLoading; fetchNextPage; hasNextPage; isFetchingNextPage; removeSender(uid) }`; tự nghe `driver.free-rides` khi được gọi (chỉ trang Free gọi).

Frontend chưa có unit test (chỉ Playwright); kiểm chứng task này bằng `tsc` + `eslint`, hành vi đầu-cuối ở Task 5.

- [ ] **Step 1: Add types**

`frontend/src/types.d.ts` — trong `declare namespace App { ... }` thêm:

```ts
  type FreeRideDirection = 'to_airport' | 'from_airport' | 'other'

  interface FreeRide {
    ride_uid: string
    sender_uid: string
    sender_name: string
    group_name: string
    direction: FreeRideDirection | null
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
    contact_url: string | null
    posted_at: number
    expires_at: number
  }

  interface FreeRidePage {
    data: FreeRide[]
    next_cursor: string | null
    latest: number | null
  }

  interface FreeRideFilters {
    direction?: FreeRideDirection
    seats?: number
    window?: '2h' | 'today' | 'tomorrow'
    q?: string
  }
```

- [ ] **Step 2: Add the API module**

`frontend/src/api/freeRides.ts`:

```ts
import api from './axios'

export const getFreeRides = (params: App.FreeRideFilters & { since?: number; cursor?: string }) =>
  api.get<App.FreeRidePage>('/driver/free-rides', { params })

export type FreeRideReportReason = 'spam' | 'wrong_info' | 'inappropriate' | 'other'

export const reportFreeRide = (rideUid: string, reason: FreeRideReportReason, note?: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/report`, { reason, note })

export const hideFreeRideSender = (senderUid: string) =>
  api.post<{ ok: true }>('/driver/free-rides/hidden-senders', { sender_uid: senderUid })

export const reportBrokenLink = (rideUid: string) =>
  api.post<{ ok: true }>(`/driver/free-rides/${encodeURIComponent(rideUid)}/broken-link`)
```

- [ ] **Step 3: Add the hook**

`frontend/src/hooks/useFreeRides.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { getFreeRides } from '@/api/freeRides'
import { getEcho } from '@/echo'
import { useAuthStore } from '@/stores/auth'

type Pages = InfiniteData<App.FreeRidePage, string | null>

// Mọi tài xế đang mở tab Free nhận tín hiệu cùng lúc → rải ngẫu nhiên để không dồn N request (giống useDriverStream).
const HERD_SPREAD_MS = 3000

/**
 * Danh sách cuốc Free + cập nhật realtime. Chỉ trang Free gọi hook này, nên kênh `driver.free-rides`
 * chỉ mở khi tài xế đang xem tab — không tốn request cho người không xem.
 * Tín hiệu chỉ mang mốc `latest`; hook gọi `since=<mốc đã biết>` rồi gộp vào trang đầu theo ride_uid.
 */
export function useFreeRides(filters: App.FreeRideFilters) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const queryKey = useMemo(() => ['free-rides', filters] as const, [filters])
  const latestRef = useRef<number | null>(null)

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getFreeRides({ ...filters, cursor: pageParam ?? undefined }).then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnWindowFocus: true,
  })

  const firstLatest = query.data?.pages[0]?.latest ?? null
  useEffect(() => {
    if (firstLatest !== null && (latestRef.current === null || firstLatest > latestRef.current)) {
      latestRef.current = firstLatest
    }
  }, [firstLatest])

  const mergeSince = useCallback(async () => {
    const since = latestRef.current
    if (since === null) return
    const { data } = await getFreeRides({ ...filters, since })
    if (data.latest !== null) latestRef.current = Math.max(latestRef.current ?? 0, data.latest)
    if (data.data.length === 0) return

    queryClient.setQueryData<Pages>(queryKey, (old) => {
      if (!old) return old
      const fresh = new Map(data.data.map((r) => [r.ride_uid, r]))
      const pages = old.pages.map((page, i) => ({
        ...page,
        data: i === 0
          ? [...data.data, ...page.data.filter((r) => !fresh.has(r.ride_uid))]
          : page.data.filter((r) => !fresh.has(r.ride_uid)),
      }))
      return { ...old, pages }
    })
  }, [filters, queryClient, queryKey])

  useEffect(() => {
    if (!token) return
    const echo = getEcho(token)
    const channel = echo.private('driver.free-rides')
    const timers: ReturnType<typeof setTimeout>[] = []

    // Kết nối lại sau khi khoá màn hình / mất mạng: tải lại ngay, không rải (người dùng đang nhìn).
    const resync = () => queryClient.invalidateQueries({ queryKey })
    echo.connector.pusher.connection.bind('connected', resync)

    channel.listen('.free-rides.updated', () => {
      timers.push(setTimeout(() => { void mergeSince() }, Math.random() * HERD_SPREAD_MS))
    })

    return () => {
      timers.forEach(clearTimeout)
      echo.connector.pusher.connection.unbind('connected', resync)
      echo.leave('driver.free-rides')
    }
  }, [token, queryClient, queryKey, mergeSince])

  const rides = useMemo(() => {
    const now = Date.now()
    return (query.data?.pages ?? []).flatMap((p) => p.data).filter((r) => r.expires_at > now)
  }, [query.data])

  // Ẩn người bắn: bỏ ngay khỏi cache, không chờ tải lại.
  const removeSender = useCallback((senderUid: string) => {
    queryClient.setQueriesData<Pages>({ queryKey: ['free-rides'] }, (old) => old && ({
      ...old,
      pages: old.pages.map((p) => ({ ...p, data: p.data.filter((r) => r.sender_uid !== senderUid) })),
    }))
  }, [queryClient])

  return {
    rides,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    removeSender,
  }
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `cd frontend && npx tsc -b --noEmit && npx eslint src/api/freeRides.ts src/hooks/useFreeRides.ts`
Expected: không lỗi. Nếu `echo.connector.pusher.connection.unbind` báo sai kiểu, đối chiếu cách `useDriverStream.ts` dùng `bind` và kiểu trong `echo.ts` — ghi ruling nếu đổi.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.d.ts frontend/src/api/freeRides.ts frontend/src/hooks/useFreeRides.ts
git commit -m "feat(free-rides): kiểu dữ liệu, API và hook danh sách cuốc Free — gộp since theo tín hiệu, rải tải 3 giây"
```

---

### Task 4: Frontend — trang tab Free, thẻ cuốc, bộ lọc, menu thao tác, tab trong layout

**Files:**
- Create: `frontend/src/components/driver/FreeRideCard.tsx`
- Create: `frontend/src/components/driver/FreeRideFilters.tsx`
- Create: `frontend/src/components/driver/FreeRideActionsSheet.tsx`
- Create: `frontend/src/pages/driver/FreeRidesPage.tsx`
- Modify: `frontend/src/router/driver.tsx` (thêm route trong nhánh `DriverLayout`)
- Modify: `frontend/src/layouts/DriverLayout.tsx` (thêm tab thứ 2)

**Interfaces:**
- Consumes: Task 3 (`useFreeRides`, API), `EmptyState` (`components/common/EmptyState.tsx`), `useUiStore().showToast`, `apiMessage` (`utils/apiError.ts`).
- Produces: route `/driver/free`; tab `{ to: '/driver/free', icon: 'local_taxi', label: 'Free', end: true }`; các `data-testid` cho e2e: `free-ride-card`, `free-ride-accept`, `free-ride-more`, `free-ride-hide-sender`.

- [ ] **Step 1: Card component**

`frontend/src/components/driver/FreeRideCard.tsx`:

```tsx
import clsx from 'clsx'

const DIRECTION_LABEL: Record<App.FreeRideDirection, string> = {
  to_airport: 'Tiễn sân bay',
  from_airport: 'Đón sân bay',
  other: 'Đường dài / nội tỉnh',
}

const timeText = (ride: App.FreeRide) => {
  if (ride.pickup_at === null) return ride.pickup_time_text ?? 'Chưa rõ giờ'
  return new Date(ride.pickup_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

const ago = (ms: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  return minutes < 1 ? 'vừa xong' : minutes < 60 ? `${minutes} phút trước` : `${Math.round(minutes / 60)} giờ trước`
}

interface Props {
  ride: App.FreeRide
  onMore: (ride: App.FreeRide) => void
}

export default function FreeRideCard({ ride, onMore }: Props) {
  return (
    <div data-testid="free-ride-card" className="bg-white rounded-card shadow-card overflow-hidden border-l-[4px] border-l-primary border border-border-soft">
      <div className="p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
            <span className="text-[15px] font-semibold text-navy">{timeText(ride)}</span>
            {ride.direction && (
              <span className="text-[11px] font-medium text-primary bg-light-green rounded-pill px-2 py-0.5 truncate">{DIRECTION_LABEL[ride.direction]}</span>
            )}
          </div>
          <button type="button" data-testid="free-ride-more" aria-label="Thao tác khác" onClick={() => onMore(ride)}
            className="min-w-touch min-h-touch -mr-2 flex items-center justify-center text-neutral-gray">
            <span className="material-symbols-outlined text-[20px]">more_vert</span>
          </button>
        </div>

        {ride.is_raw || !ride.pickup ? (
          <p className="text-[14px] text-navy whitespace-pre-line">{ride.raw_text}</p>
        ) : (
          <div className="flex flex-col gap-1 text-[14px] text-navy">
            <p className="flex gap-2"><span className="material-symbols-outlined text-[16px] text-success-green">trip_origin</span>{ride.pickup}</p>
            <p className="flex gap-2"><span className="material-symbols-outlined text-[16px] text-danger-red">location_on</span>{ride.destination}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {ride.price !== null && <span className="font-semibold text-navy">{ride.price.toLocaleString('vi-VN')}đ</span>}
          {ride.is_free && <span className="font-semibold text-success-green bg-emerald-50 rounded-pill px-2 py-0.5">Không chiết khấu</span>}
          {ride.seats !== null && <span className="text-neutral-gray">Xe {ride.seats} chỗ</span>}
          {ride.vehicle_note && <span className="text-neutral-gray uppercase">{ride.vehicle_note}</span>}
        </div>

        {!ride.is_raw && ride.pickup && (
          <details className="text-[12px] text-neutral-gray">
            <summary className="cursor-pointer">Tin gốc</summary>
            <p className="mt-1 whitespace-pre-line">{ride.raw_text}</p>
          </details>
        )}

        <p className="text-[11px] text-neutral-gray">
          {ride.sender_name || 'Người bắn cuốc'} · {ride.group_name || 'Nhóm Zalo'}
          {ride.group_count > 1 && ` · đăng ở ${ride.group_count} nhóm`} · {ago(ride.posted_at)}
        </p>

        {ride.contact_url ? (
          <a data-testid="free-ride-accept" href={ride.contact_url}
            className="w-full min-h-touch rounded-pill py-2.5 text-[14px] font-semibold bg-primary text-white flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">chat</span>
            Nhận cuốc — mở Zalo
          </a>
        ) : (
          <span data-testid="free-ride-accept"
            className={clsx('w-full min-h-touch rounded-pill py-2.5 text-[14px] font-semibold flex items-center justify-center', 'bg-border-gray text-neutral-gray')}>
            Chưa liên hệ được
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Filters component**

`frontend/src/components/driver/FreeRideFilters.tsx`:

```tsx
import clsx from 'clsx'
import { useEffect, useState } from 'react'

const DIRECTIONS: { value?: App.FreeRideDirection; label: string }[] = [
  { label: 'Tất cả' },
  { value: 'to_airport', label: 'Tiễn sân bay' },
  { value: 'from_airport', label: 'Đón sân bay' },
  { value: 'other', label: 'Khác' },
]
const WINDOWS: { value?: App.FreeRideFilters['window']; label: string }[] = [
  { label: 'Mọi giờ' },
  { value: '2h', label: '2 giờ tới' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'tomorrow', label: 'Ngày mai' },
]
const SEATS = [4, 5, 7, 16]

interface Props {
  value: App.FreeRideFilters
  onChange: (next: App.FreeRideFilters) => void
}

const chip = (active: boolean) =>
  clsx('rounded-pill px-3 min-h-[36px] text-[13px] font-medium whitespace-nowrap transition-colors',
    active ? 'bg-primary text-white' : 'bg-light-green text-primary')

export default function FreeRideFilters({ value, onChange }: Props) {
  const [q, setQ] = useState(value.q ?? '')

  // Gõ tìm kiếm: chờ 400ms mới lọc để không gọi API mỗi phím.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q: q || undefined })
    }, 400)
    return () => clearTimeout(t)
  }, [q, value, onChange])

  return (
    <div className="bg-white px-4 pt-3 pb-2 border-b border-border-gray flex flex-col gap-2">
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm địa điểm (vd: Hà Đông, T2...)"
        className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DIRECTIONS.map((d) => (
          <button key={d.label} type="button" className={chip(value.direction === d.value)} onClick={() => onChange({ ...value, direction: d.value })}>{d.label}</button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {WINDOWS.map((w) => (
          <button key={w.label} type="button" className={chip(value.window === w.value)} onClick={() => onChange({ ...value, window: w.value })}>{w.label}</button>
        ))}
        {SEATS.map((s) => (
          <button key={s} type="button" className={chip(value.seats === s)} onClick={() => onChange({ ...value, seats: value.seats === s ? undefined : s })}>{s} chỗ</button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Actions sheet component**

`frontend/src/components/driver/FreeRideActionsSheet.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query'
import { hideFreeRideSender, reportBrokenLink, reportFreeRide, type FreeRideReportReason } from '@/api/freeRides'
import { useUiStore } from '@/stores/ui'
import { apiMessage } from '@/utils/apiError'

const REASONS: { value: FreeRideReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam / quảng cáo' },
  { value: 'wrong_info', label: 'Sai thông tin' },
  { value: 'inappropriate', label: 'Nội dung không phù hợp' },
  { value: 'other', label: 'Khác' },
]

interface Props {
  ride: App.FreeRide
  onClose: () => void
  onSenderHidden: (senderUid: string) => void
}

export default function FreeRideActionsSheet({ ride, onClose, onSenderHidden }: Props) {
  const showToast = useUiStore((s) => s.showToast)
  const fail = (err: unknown) => showToast(apiMessage(err, 'Không thực hiện được, thử lại sau'), 'error')

  const hide = useMutation({
    mutationFn: () => hideFreeRideSender(ride.sender_uid),
    onSuccess: () => { onSenderHidden(ride.sender_uid); showToast('Đã ẩn cuốc của người bắn này', 'success'); onClose() },
    onError: fail,
  })
  const broken = useMutation({
    mutationFn: () => reportBrokenLink(ride.ride_uid),
    onSuccess: () => { showToast('Đã báo, hệ thống sẽ lấy lại liên hệ', 'success'); onClose() },
    onError: fail,
  })
  const report = useMutation({
    mutationFn: (reason: FreeRideReportReason) => reportFreeRide(ride.ride_uid, reason),
    onSuccess: () => { showToast('Cảm ơn bạn đã báo cáo', 'success'); onClose() },
    onError: fail,
  })

  const item = 'w-full min-h-touch px-4 flex items-center gap-3 text-[14px] text-navy text-left active:bg-light-green'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl pb-6 pt-2" onClick={(e) => e.stopPropagation()}>
        {ride.contact_url && (
          <button type="button" className={item} onClick={() => broken.mutate()} disabled={broken.isPending}>
            <span className="material-symbols-outlined text-[20px] text-neutral-gray">link_off</span>Nút Nhận cuốc mở sai trang
          </button>
        )}
        <button type="button" data-testid="free-ride-hide-sender" className={item} onClick={() => hide.mutate()} disabled={hide.isPending}>
          <span className="material-symbols-outlined text-[20px] text-neutral-gray">visibility_off</span>Ẩn mọi cuốc của {ride.sender_name || 'người này'}
        </button>
        <p className="px-4 pt-3 pb-1 text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">Báo cáo cuốc</p>
        {REASONS.map((r) => (
          <button key={r.value} type="button" className={item} onClick={() => report.mutate(r.value)} disabled={report.isPending}>
            <span className="material-symbols-outlined text-[20px] text-neutral-gray">flag</span>{r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Page, route, tab**

`frontend/src/pages/driver/FreeRidesPage.tsx`:

```tsx
import { useCallback, useState } from 'react'
import EmptyState from '@/components/common/EmptyState'
import FreeRideCard from '@/components/driver/FreeRideCard'
import FreeRideFilters from '@/components/driver/FreeRideFilters'
import FreeRideActionsSheet from '@/components/driver/FreeRideActionsSheet'
import { useFreeRides } from '@/hooks/useFreeRides'

const STORAGE_KEY = 'free-rides-filters'

function loadFilters(): App.FreeRideFilters {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as App.FreeRideFilters
  } catch {
    return {}
  }
}

export default function FreeRidesPage() {
  const [filters, setFilters] = useState<App.FreeRideFilters>(loadFilters)
  const [selected, setSelected] = useState<App.FreeRide | null>(null)
  const { rides, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, removeSender } = useFreeRides(filters)

  const changeFilters = useCallback((next: App.FreeRideFilters) => {
    setFilters(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* trình duyệt chặn lưu → chỉ mất ghi nhớ bộ lọc */ }
  }, [])

  return (
    <div className="w-full flex flex-col">
      <FreeRideFilters value={filters} onChange={changeFilters} />
      <div className="px-4 py-3">
        <p className="text-[12px] text-neutral-gray">
          Cuốc tổng hợp từ các nhóm Zalo. GreenCA chỉ kết nối — bạn trao đổi trực tiếp với người bắn cuốc.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-neutral-gray py-10">Đang tải cuốc…</p>
      ) : rides.length === 0 ? (
        <EmptyState icon="local_taxi" title="Chưa có cuốc Free phù hợp" description="Thử đổi bộ lọc hoặc quay lại sau ít phút." />
      ) : (
        <div className="flex flex-col px-4 gap-2.5 pb-4">
          {rides.map((ride) => <FreeRideCard key={ride.ride_uid} ride={ride} onMore={setSelected} />)}
          {hasNextPage && (
            <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="w-full min-h-touch text-sm text-primary font-medium">
              {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {selected && <FreeRideActionsSheet ride={selected} onClose={() => setSelected(null)} onSenderHidden={removeSender} />}
    </div>
  )
}
```

`frontend/src/router/driver.tsx` — thêm import `import FreeRidesPage from '@/pages/driver/FreeRidesPage'` và trong mảng `children` của `<DriverLayout />`, ngay sau dòng `{ path: '/driver/trips', element: <TripListPage /> },`:

```tsx
          { path: '/driver/free', element: <FreeRidesPage /> },
```

`frontend/src/layouts/DriverLayout.tsx` — trong mảng `TABS`, ngay sau phần tử `/driver/trips`:

```tsx
  { to: '/driver/free',          icon: 'local_taxi',             label: 'Free',     end: true },
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `cd frontend && npx tsc -b --noEmit && npx eslint src/components/driver/FreeRide*.tsx src/pages/driver/FreeRidesPage.tsx src/router/driver.tsx src/layouts/DriverLayout.tsx && npm run build:driver -- --mode development`
Expected: không lỗi; build driver thành công.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/driver/FreeRideCard.tsx frontend/src/components/driver/FreeRideFilters.tsx frontend/src/components/driver/FreeRideActionsSheet.tsx frontend/src/pages/driver/FreeRidesPage.tsx frontend/src/router/driver.tsx frontend/src/layouts/DriverLayout.tsx
git commit -m "feat(free-rides): tab Free trong app tài xế — thẻ cuốc, bộ lọc nhớ lựa chọn, Nhận cuốc mở Zalo, báo cáo/ẩn/link lỗi"
```

---

### Task 5: Kiểm thử đầu-cuối + kiểm tra trên điện thoại

**Files:**
- Create: `frontend/e2e/fixtures/freeRides.ts`
- Create: `frontend/e2e/free-rides.spec.ts`
- Modify: `docs/DEPLOY.md` (mục Microservice Zalo — thêm giai đoạn 3)

**Interfaces:**
- Consumes: endpoint `POST /api/internal/zalo/rides` (đường thật service dùng), tài xế seed `0912345678` (active), `loginExisting` (`e2e/fixtures/auth.ts`), `APP`, `SEEDED`.

Yêu cầu môi trường: Docker local chạy, `backend/.env` có `ZALO_SERVICE_ENABLED=true` và `ZALO_BOT_SECRET` (mặc định test dùng `dev-secret`, ghi đè bằng `E2E_ZALO_SECRET`), queue worker chạy (tín hiệu realtime), dữ liệu seed (`make fresh`).

- [ ] **Step 1: Write the fixture and the failing e2e test**

`frontend/e2e/fixtures/freeRides.ts`:

```ts
import { createHmac, randomUUID } from 'node:crypto'

const API = process.env.E2E_API ?? 'http://localhost:8080'
const SECRET = process.env.E2E_ZALO_SECRET ?? 'dev-secret'

export interface SeedRide {
  pickup: string
  senderUid: string
  qrCode?: string | null
}

/** Đẩy cuốc qua đúng endpoint service Node dùng (ký HMAC như service). Trả ride_uid. */
export async function pushFreeRides(rides: SeedRide[]): Promise<string[]> {
  const now = Date.now()
  const payload = rides.map((r) => ({
    ride_uid: `e2e-${randomUUID()}`, sender_uid: r.senderUid, sender_name: `Người bắn ${r.senderUid}`, qr_code: r.qrCode ?? null,
    zalo_group_id: 'e2e-group', group_name: 'Nhóm E2E', direction: 'to_airport', pickup: r.pickup, destination: 'Sân bay Nội Bài',
    pickup_at: now + 3_600_000, pickup_time_text: 'sau 1 giờ', seats: 5, vehicle_note: null, price: 250000,
    is_free: true, is_raw: false, raw_text: `tiễn ${r.pickup} 250k`, group_count: 1, posted_at: now, expires_at: now + 2 * 3_600_000,
  }))
  const body = JSON.stringify({ rides: payload })
  const ts = String(Math.floor(now / 1000))
  const signature = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${API}/api/internal/zalo/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Zalo-Timestamp': ts, 'X-Zalo-Signature': signature },
    body,
  })
  if (res.status !== 200) throw new Error(`Đẩy cuốc E2E lỗi HTTP ${res.status}: ${await res.text()}`)
  return payload.map((p) => p.ride_uid)
}
```

`frontend/e2e/free-rides.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { pushFreeRides } from './fixtures/freeRides'

test('tài xế thấy cuốc Free, nút Nhận cuốc mở Zalo, ẩn được người bắn', async ({ page }) => {
  const tag = Date.now().toString(36)
  await pushFreeRides([
    { pickup: `Điểm có mã ${tag}`, senderUid: `e2e-a-${tag}`, qrCode: 'e2etestcode123' },
    { pickup: `Điểm chưa mã ${tag}`, senderUid: `e2e-b-${tag}`, qrCode: null },
  ])

  await loginExisting(page, APP.driver, SEEDED.driver)
  await expect(page).toHaveURL(/\/driver\/trips/)
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page).toHaveURL(/\/driver\/free/)

  const withCode = page.getByTestId('free-ride-card').filter({ hasText: `Điểm có mã ${tag}` })
  const withoutCode = page.getByTestId('free-ride-card').filter({ hasText: `Điểm chưa mã ${tag}` })
  await expect(withCode).toBeVisible()
  await expect(withCode.getByTestId('free-ride-accept')).toHaveAttribute('href', 'zalo://qr/p/e2etestcode123')
  await expect(withoutCode.getByTestId('free-ride-accept')).toHaveText('Chưa liên hệ được')

  // Cuốc mới tới khi đang mở trang → hiện ra không cần tải lại (tín hiệu realtime + since, rải ≤ 3 giây)
  await pushFreeRides([{ pickup: `Điểm realtime ${tag}`, senderUid: `e2e-c-${tag}`, qrCode: 'e2erealtime' }])
  await expect(page.getByTestId('free-ride-card').filter({ hasText: `Điểm realtime ${tag}` })).toBeVisible({ timeout: 15_000 })

  // Ẩn người bắn → biến mất ngay, tải lại trang vẫn không thấy
  await withCode.getByTestId('free-ride-more').click()
  await page.getByTestId('free-ride-hide-sender').click()
  await expect(withCode).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: `Điểm chưa mã ${tag}` })).toBeVisible()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: `Điểm có mã ${tag}` })).toHaveCount(0)
})
```

- [ ] **Step 2: Run on a tree without Task 1–4 to see it fail (or note it)**

Nếu Task 1–4 đã commit (thứ tự kế hoạch), bước RED của e2e đã được thay bằng RED của các test Laravel ở Task 1–2; chạy test này để xác nhận GREEN ở bước sau. Nếu chạy trước Task 4:
Run: `cd frontend && npx playwright test e2e/free-rides.spec.ts`
Expected: FAIL — không có link "Free".

- [ ] **Step 3: Run the e2e test**

```bash
docker compose exec -T app php artisan migrate
cd frontend && npx playwright test e2e/free-rides.spec.ts
```

Expected: PASS. Nếu bước realtime hết 15 giây: kiểm tra queue worker (`docker compose logs worker`) và Reverb (`docker compose logs reverb`) đang chạy — CLAUDE.md: thiếu Reverb là mất realtime mà không có lỗi nào.

- [ ] **Step 4: Manual check on phones (deep link)**

Trên iPhone (Safari, PWA đã thêm ra màn hình chính) và Android (Chrome) có cài Zalo, mở `http://<IP máy dev>:5174`, đăng nhập tài xế seed, vào tab Free, bấm "Nhận cuốc" trên một cuốc có mã thật (đẩy bằng `pushFreeRides` với mã QR nick chính của anh):
- Ghi lại: có hiện hộp thoại "Mở trong Zalo?" không, mở đúng trang cá nhân không.
- Kết quả ghi vào mục 8 "Việc còn mở" của spec (thay dòng "Hành vi PWA ... khi mở `zalo://`").

- [ ] **Step 5: Docs and commit**

`docs/DEPLOY.md` — trong mục "Microservice Zalo — Cuốc Free" thêm:

````markdown
### Giai đoạn 3 — tab Free

- `php artisan migrate --force` (bảng `free_ride_reports`, `driver_hidden_senders`).
- Cần queue worker + Reverb chạy: tín hiệu `free-rides.updated` phát qua job `BroadcastFreeRidesSignal` (gom ≤ 1 tín hiệu / ~2 giây).
- Build lại app tài xế (`npm run build:driver -- --mode production`, kiểm VAPID như các lần deploy trước) và rsync `dist-driver/`.
````

```bash
git add frontend/e2e/fixtures/freeRides.ts frontend/e2e/free-rides.spec.ts docs/DEPLOY.md
git commit -m "test(free-rides): e2e tab Free — hiển thị, deep link Zalo, realtime, ẩn người bắn; runbook giai đoạn 3"
```
