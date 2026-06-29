# Design: Tích hợp South Telecom ZNS OTP

**Ngày:** 2026-06-29
**Tác giả:** Dương Tiến Đạt
**Tài liệu tham khảo:** `docs/Send_API_ZNS_Debit_v2.2.pdf` (South Telecom, phiên bản 2.2)

---

## 1. Bối cảnh & Mục tiêu

Hệ thống hiện tại có `ZaloZnsService` gọi thẳng Zalo Open API (OAuth). Dự án chuyển sang dùng **South Telecom** làm cổng trung gian (đại lý ZNS) theo giao thức API trả trước (Basic Auth, endpoint `api-04.worldsms.vn`). Yêu cầu:

- Giữ `ZaloZnsService` (Zalo trực tiếp) — chạy song song, chọn provider qua env.
- Thêm `SouthTelecomZnsService` theo tài liệu South Telecom v2.2.
- Bổ sung DLR callback (báo cáo giao tin bất đồng bộ).
- Bổ sung API admin xem số dư tài khoản (Get Balance).
- Không tích hợp SMS Failover trong lần này.

---

## 2. Kiến trúc tổng quan

```
OtpController
    └── ZnsSender (interface)
            ├── ZaloZnsService        (provider=zalo, giữ nguyên + implement interface)
            └── SouthTelecomZnsService (provider=southtelecom, MỚI)

GET /api/zns/dlr         → ZnsDlrController   (public, token-guard)
GET /api/admin/zns/balance → Admin\ZnsController (auth:sanctum, role:admin)
```

Binding: `AppServiceProvider` đọc `config('services.zns.provider')` và bind `ZnsSender::class` → class tương ứng.

---

## 3. Contract & DTO

### `App\Services\Zns\ZnsSender` (interface)

```php
interface ZnsSender
{
    public function send(string $phone, string $code): ZnsSendResult;
    public function getBalance(): ?int;
}
```

### `App\Services\Zns\ZnsSendResult` (DTO)

| Property | Type | Mô tả |
|---|---|---|
| `success` | bool | Gửi thành công hay không |
| `clientReqId` | ?string | UUID do ta sinh, dùng để khớp DLR |
| `trackingId` | ?string | tracking_id từ South Telecom |
| `error` | ?string | Mô tả lỗi nếu thất bại |

---

## 4. SouthTelecomZnsService (mới)

### 4.1 `send(string $phone, string $code): ZnsSendResult`

1. Sinh `client_req_id = Str::uuid()->toString()`
2. POST `{SOUTHTELECOM_ZNS_BASE_URL}/sendZNS`
   - Header: `Authorization: Basic base64(user:password)`, `Content-Type: application/json`, `Accept: application/json`
   - Body:
     ```json
     {
       "from": "<SOUTHTELECOM_ZNS_FROM>",
       "to": "84xxxxxxxxx",
       "template_id": "<SOUTHTELECOM_ZNS_TEMPLATE_ID>",
       "template_data": { "otp": "<code>" },
       "client_req_id": "<uuid>",
       "dlr": 1
     }
     ```
3. Số điện thoại: `toInternational()` — bỏ `0` đầu, thêm `84`.
4. Response thành công: `status == 1` → trả `ZnsSendResult(success=true, clientReqId, trackingId)`.
5. Response thất bại: `status == 0` → log `[errorcode, description]`, trả `ZnsSendResult(success=false, error=description)`.

**Bảng errorcode quan trọng (log chi tiết, hiển thị thông báo chung cho user):**

| Code | Ý nghĩa |
|---|---|
| 40/41/42 | Auth thất bại |
| 51 | IP không hợp lệ |
| 53 | Số điện thoại không hợp lệ |
| 557 | Sai format template |
| 811 | Tài khoản không được phép gửi ZNS |
| 82 | Hết quota |
| 83 | Không tìm thấy bảng giá |

### 4.2 `getBalance(): ?int`

- GET `{SOUTHTELECOM_ZNS_BASE_URL}/getBalance`
- Cùng Basic Auth.
- Response thành công: `status == 1` → trả `balance` (int).
- Thất bại → log + trả `null`.

---

## 5. ZaloZnsService (sửa nhẹ)

- Implement `ZnsSender`.
- Đổi tên `sendOtp(string $phone, string $code): bool` → `send(string $phone, string $code): ZnsSendResult`.
- Sinh `clientReqId = Str::uuid()` (không gửi cho Zalo nhưng lưu để khớp DLR nếu sau này cần).
- `getBalance(): ?int` → trả `null` (Zalo Direct không có API này).
- Logic OAuth và `toInternational()` giữ nguyên.

---

## 6. Binding Provider

### `config/services.php` — bổ sung:

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

### `AppServiceProvider::register()`:

```php
$this->app->bind(\App\Services\Zns\ZnsSender::class, function () {
    return match(config('services.zns.provider')) {
        'zalo'         => app(\App\Services\ZaloZnsService::class),
        default        => app(\App\Services\SouthTelecomZnsService::class),
    };
});
```

---

## 7. OtpController — sửa `send()`

- Inject `ZnsSender` (type-hint interface).
- **Môi trường local:** bypass không đổi — log OTP, không gọi provider.
- **Production:**
  1. Gọi `$sender->send($phone, $code)`.
  2. Thành công → cập nhật bản ghi `Otp` vừa tạo với `client_req_id`, `tracking_id`, `delivery_status = 'pending'`.
  3. Thất bại → trả 503 thông báo chung (giữ nguyên UX).

---

## 8. DLR Callback

### 8.1 Route

```
GET /api/zns/dlr    (public — ngoài auth:sanctum)
```

URL đầy đủ đăng ký với South Telecom: `https://<domain>/api/zns/dlr?token=<SOUTHTELECOM_ZNS_DLR_TOKEN>`

### 8.2 `ZnsDlrController@handle()`

1. Kiểm tra `request('token') === config('services.southtelecom_zns.dlr_token')` — sai → trả 403.
2. Đọc query params: `smsid` (= client_req_id), `status` (tổng hợp ZNS + SMS), `ottstatus` (ZNS riêng), `otterrorcode`, `deliveredts`.
3. Tìm `Otp::where('client_req_id', $smsid)->first()`.
4. Nếu tìm thấy: cập nhật `delivery_status` (`'delivered'` khi `status == 1`, `'failed'` khi `status == 0`) và `delivered_at` (parse `deliveredts` Unix timestamp).
5. Log kết quả DLR.
6. Luôn trả `response('OK', 200)` (bất kể tìm thấy hay không — South Telecom có thể gửi lại nhiều lần).

---

## 9. Admin Get Balance

**Route:** `GET /api/admin/zns/balance` — trong nhóm `auth:sanctum` + `role:admin`.

**`Admin\ZnsController@balance()`:**

```php
public function balance(): JsonResponse
{
    $balance = app(ZnsSender::class)->getBalance();
    return response()->json(['balance' => $balance]);
}
```

Response: `{ "balance": 547050 }` hoặc `{ "balance": null }` nếu lỗi/provider không hỗ trợ.

---

## 10. Migration — bổ sung cột vào `otps`

Migration mới: `add_zns_fields_to_otps_table`

| Cột | Type | Default | Nullable | Ghi chú |
|---|---|---|---|---|
| `client_req_id` | string | — | yes | index; UUID sinh khi gửi; dùng khớp DLR |
| `tracking_id` | string | — | yes | tracking_id từ South Telecom |
| `delivery_status` | string | `'pending'` | yes | `pending` / `delivered` / `failed` |
| `delivered_at` | timestamp | — | yes | Thời điểm xác nhận từ DLR |

Cập nhật `Otp::$fillable` và `$casts` (`delivered_at => 'datetime'`).

---

## 11. Env mới (.env.example)

```dotenv
ZNS_PROVIDER=southtelecom

SOUTHTELECOM_ZNS_BASE_URL=https://api-04.worldsms.vn/apidebit
SOUTHTELECOM_ZNS_USER=
SOUTHTELECOM_ZNS_PASSWORD=
SOUTHTELECOM_ZNS_FROM=
SOUTHTELECOM_ZNS_TEMPLATE_ID=
SOUTHTELECOM_ZNS_DLR_TOKEN=
```

Giữ nguyên các biến `ZALO_*` cũ (dùng khi `ZNS_PROVIDER=zalo`).

---

## 12. Testing (feature tests, `Http::fake()`)

| Scenario | Assert |
|---|---|
| `SouthTelecomZnsService::send()` thành công (`status=1`) | Trả `success=true`, `clientReqId` + `trackingId` đúng |
| `SouthTelecomZnsService::send()` thất bại (`status=0`, code 82) | Trả `success=false`, log errorcode |
| `OtpController::send()` production thành công | Bản ghi `Otp` có `client_req_id`, `tracking_id`, `delivery_status=pending` |
| `OtpController::send()` production thất bại | Response 503 |
| `OtpController::send()` local bypass | Không gọi Http, luôn 200 |
| `ZnsDlrController` — token đúng, `status=1` | `Otp.delivery_status = delivered`, `delivered_at` được ghi |
| `ZnsDlrController` — token đúng, `status=0` | `Otp.delivery_status = failed` |
| `ZnsDlrController` — token sai | Response 403 |
| `Admin\ZnsController@balance` — admin role | Response `{ balance: <int> }` |
| `Admin\ZnsController@balance` — non-admin | Response 403 |
| Provider binding `ZNS_PROVIDER=zalo` | `ZnsSender` resolve ra `ZaloZnsService` |
| Provider binding `ZNS_PROVIDER=southtelecom` | `ZnsSender` resolve ra `SouthTelecomZnsService` |
| `ZaloZnsService::getBalance()` | Trả `null` |

---

## 13. Không nằm trong phạm vi lần này

- SMS Failover (sẽ bổ sung sau nếu cần)
- Hiển thị số dư trên giao diện admin dashboard (chỉ có API)
- Cron tự động kiểm tra số dư
- Rotation refresh token cho Zalo Direct (đã có, giữ nguyên)
