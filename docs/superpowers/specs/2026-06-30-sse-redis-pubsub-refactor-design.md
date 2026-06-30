# SSE Refactor: Redis Pub/Sub thay thế DB Polling

**Ngày:** 2026-06-30  
**Scope:** Backend `StreamController` + 2 controller publisher  
**Frontend:** Không thay đổi

---

## Bối cảnh

`StreamController::trips()` hiện tại dùng DB polling — cứ 3 giây query MySQL 3 lần để phát hiện sự kiện mới. Yêu cầu nghiệp vụ ("Cuốc mới hiển thị ngay không cần F5") cần độ trễ ~0ms, không phải ~3s.

Project đã từng dùng Redis pub/sub nhưng revert về DB polling vì 2 lỗi implementation:

1. **Subscriber dùng `return false` trong callback** — phpredis thoát subscription sau mỗi message, tạo lại connection → window mất message.
2. **Publisher thiếu `trip_taken`** — `TripController::accept` không publish gì, nên driver khác không biết chuyến đã bị lấy.

---

## Kiến trúc

```
BookingController::store()    ──┐
BookingController::cancel()   ──┼──► Redis::publish('driver.trips.events', $payload)
TripController::accept()      ──┘           │
                                            ▼
                                   Redis Channel: driver.trips.events
                                            │
                                   StreamController::trips()
                                   Redis::connection()->client()->subscribe(...)
                                            │
                                   SSE → EventSource (frontend)
```

---

## Thay đổi backend

### 1. `StreamController.php`

**Xóa:** toàn bộ vòng lặp `while + sleep(3) + DB queries`.

**Thêm:** subscription loop với Redis pub/sub:

```php
return response()->stream(function () use ($user) {
    set_time_limit(0);
    ignore_user_abort(true);
    @ini_set('zlib.output_compression', 0);

    $this->emit(['type' => 'connected', 'driver_id' => $user->id]);

    $maxAt = time() + 300;

    while (! connection_aborted() && time() < $maxAt) {
        try {
            $redis = Redis::connection()->client();
            $redis->setOption(\Redis::OPT_READ_TIMEOUT, 5);

            $redis->subscribe(['driver.trips.events'], function ($r, $channel, $message) use ($maxAt) {
                $data = json_decode($message, true);
                if ($data) {
                    $this->emit($data);
                }
                if (connection_aborted() || time() >= $maxAt) {
                    $r->unsubscribe();
                }
            });
        } catch (\RedisException) {
            // Read timeout (5s) → heartbeat, rồi subscribe lại
            if (! connection_aborted()) {
                echo ": ping\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }
        } catch (\Throwable) {
            // Redis unavailable → thoát, EventSource tự reconnect sau 3s
            break;
        }
    }
}, 200, [
    'Content-Type'      => 'text/event-stream',
    'Cache-Control'     => 'no-cache, no-store',
    'X-Accel-Buffering' => 'no',
    'Connection'        => 'keep-alive',
]);
```

### 2. `BookingController.php`

Đổi tên channel ở 2 chỗ:

| Chỗ | Cũ | Mới |
|---|---|---|
| `store()` | `'driver.new-booking'` | `'driver.trips.events'` |
| `cancel()` | `'driver.new-booking'` | `'driver.trips.events'` |

### 3. `TripController.php`

Thêm publish sau khi driver accept booking:

```php
Redis::publish('driver.trips.events', json_encode([
    'type'       => 'trip_taken',
    'booking_id' => $booking->id,
]));
```

---

## Không thay đổi

- `useDriverStream.ts` — logic EventSource, reconnect, event handling giữ nguyên
- `TripListPage.tsx` — giữ nguyên
- Route `/api/driver/stream` — giữ nguyên
- Auth via `?token=` query param — giữ nguyên

---

## Edge cases

| Tình huống | Xử lý |
|---|---|
| Redis không available khi connect | `\Throwable` catch → break → EventSource retry sau 3s |
| Redis mất kết nối giữa chừng | `RedisException` → heartbeat → vòng lặp while tạo lại connection |
| Driver đóng tab | `connection_aborted()` → `$r->unsubscribe()` → PHP process thoát |
| Message đến khi không có driver online | Fire-and-forget, drop. Driver reconnect → `connected` event → `invalidateQueries(['trips'])` bắt kịp |
| Nhiều driver cùng connected | Tất cả nhận cùng event, client tự filter theo context |

---

## Payload format (không đổi)

```json
{ "type": "new_booking",       "booking_id": 123 }
{ "type": "booking_cancelled", "booking_id": 123, "driver_id": 45 }
{ "type": "trip_taken",        "booking_id": 123 }
{ "type": "connected",         "driver_id": 45 }
```
