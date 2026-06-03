# Spec: Gửi OTP qua Zalo ZNS

## Mục tiêu

Gửi OTP đăng ký / đặt lại mật khẩu qua Zalo ZNS thay vì SMS. Zalo ZNS không có phí cố định (không cần đăng ký brand name), chỉ tính theo tin nhắn (~200–500 VND/tin), phù hợp thị trường VN (~73M user Zalo).

---

## Zalo ZNS API

| Thuộc tính | Giá trị |
|---|---|
| Token endpoint | `POST https://oauth.zaloapp.com/v4/access_token` |
| Send endpoint | `POST https://business.openapi.zalo.me/message/template` |
| Auth gửi tin | Header `access_token: {token}` |
| Định dạng số | `84xxxxxxxxx` (bỏ số `0` đầu, thêm `84`) |
| User cần | Có Zalo, SĐT trùng khớp. Không cần follow OA |

### Lấy access_token

```
POST https://oauth.zaloapp.com/v4/access_token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
app_id={ZALO_APP_ID}
secret_key={ZALO_APP_SECRET}
refresh_token={ZALO_REFRESH_TOKEN}
```

Response:
```json
{ "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
```

- `access_token` hết hạn sau ~1 giờ → cache Redis 50 phút, tự refresh khi miss
- `refresh_token` mới (nếu có) được tự động ghi đè vào `.env` bởi `ZaloZnsService::persistRefreshToken()`
- Nếu refresh_token hết hạn (~3 tháng không dùng) → cần lấy lại thủ công qua Zalo OAuth flow

### Gửi ZNS

```
POST https://business.openapi.zalo.me/message/template
access_token: {token}
Content-Type: application/json

{
  "phone": "84912345678",
  "template_id": "{ZALO_OTP_TEMPLATE_ID}",
  "template_data": { "otp": "123456" }
}
```

Response:
```json
{ "error": 0,    "message": "Success", "data": { ... } }
{ "error": -216, "message": "Invalid template" }
```

### Mã lỗi phổ biến

| error | Ý nghĩa |
|---|---|
| `0` | Thành công |
| `-201` | Token không hợp lệ / hết hạn |
| `-216` | Template không hợp lệ hoặc chưa duyệt |
| `-208` | Số điện thoại không dùng Zalo |
| `-210` | OA bị user block |

---

## Setup một lần (ngoài code)

1. Tạo Zalo OA tại `oa.zalo.me`
2. Tạo Zalo App tại `developers.zalo.me`, liên kết OA → lấy `app_id`, `secret_key`
3. Đăng ký ZNS template OTP (duyệt 1–3 ngày làm việc):
   ```
   Mã OTP của bạn là {{otp}}. Có hiệu lực trong 5 phút. Không chia sẻ mã này cho ai.
   ```
4. Lấy `refresh_token` lần đầu qua Zalo OAuth flow → lưu vào `.env`

---

## Cấu trúc code

### Service
`backend/app/Services/ZaloZnsService.php`
- `sendOtp(string $phone, string $code): bool`
- `getAccessToken()` — đọc từ Redis cache, miss → gọi `refreshAccessToken()`
- `refreshAccessToken()` — gọi Zalo OAuth, cache token mới, persist refresh_token vào `.env`
- `toInternational()` — convert `0xxx` → `84xxx`

### Controller
`backend/app/Http/Controllers/Auth/OtpController.php`
- Môi trường `local`: chỉ log OTP ra console, không gọi Zalo
- Môi trường khác: gọi `ZaloZnsService::sendOtp()`, trả 503 nếu thất bại

---

## Env vars cần thiết

```env
ZALO_APP_ID=              # Lấy tại developers.zalo.me
ZALO_APP_SECRET=          # Lấy tại developers.zalo.me
ZALO_REFRESH_TOKEN=       # Lấy 1 lần qua Zalo OAuth flow
ZALO_OTP_TEMPLATE_ID=     # Sau khi template được duyệt
```

---

## Route

| Method | URI | Action |
|---|---|---|
| POST | `/api/auth/otp/send` | Tạo OTP, gửi qua Zalo ZNS |
| POST | `/api/auth/otp/verify` | Xác thực OTP, trả Sanctum token |

---

## Dev / Testing

- **Local dev:** `APP_ENV=local` → OTP in ra `docker logs`, không gọi Zalo
- **Bypass:** Gửi OTP `000000` luôn xác thực thành công (mọi môi trường)
- **Staging:** Điền đủ 4 env vars → gọi `POST /api/auth/otp/send` → SĐT nhận tin trong Zalo app
- **Token cache:** Gọi 2 lần liên tiếp → chỉ hit Zalo OAuth 1 lần (lần 2 đọc Redis)
