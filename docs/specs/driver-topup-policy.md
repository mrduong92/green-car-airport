# Chính sách Nạp điểm cho Tài xế (Sepay Webhook)

## Tổng quan

Tài xế nạp điểm vào ví (`wallet.points`) bằng cách **chuyển khoản đến tài khoản ngân hàng công ty**. Hệ thống tự động cộng điểm khi tiền vào tài khoản — không có thao tác thủ công của admin. Cơ chế: tích hợp **Sepay webhook** (https://docs.sepay.vn/tich-hop-webhooks.html); Sepay quan sát tài khoản công ty và POST sự kiện về backend mỗi khi có biến động số dư.

> **Quy đổi cố định:** 1 điểm = 1.000 VND. Phần lẻ < 1.000đ bị bỏ qua (vẫn ghi vào `sepay_webhook_events.raw_payload` để truy vết).

---

## Nguyên tắc cốt lõi

> **Idempotent theo `sepay.id`.** Mỗi giao dịch Sepay chỉ được cộng điểm đúng 1 lần, dù webhook bị retry tối đa 7 lần trong 5 giờ. Anchor idempotency là `UNIQUE(sepay_id)` trên bảng `sepay_webhook_events`.

> **Webhook luôn trả 200 + `{"success": true}`** (kể cả khi unmatched/ignored) — để Sepay không retry vô ích. Chỉ trả lỗi khi sai API key (401) hoặc payload không parse được (400).

---

## Lifecycle của một lần nạp

```
Tài xế mở /driver/wallet/topup
    ↓
UI hiển thị: STK ngân hàng công ty + mã CK của tài xế (GCA000123) + QR VietQR
    ↓
Tài xế chuyển khoản (ngoài app), nội dung CK = GCA000123
    ↓
Bank ghi nhận tiền vào → Sepay phát sự kiện
    ↓
POST /api/webhooks/sepay  (Authorization: Apikey <KEY>)
    ↓
SepayWebhookController::handle()
    ↓
SepayWebhookService::process(payload)
  ├─ Verify API key (sai → 401, không ghi DB)
  ├─ insertOrIgnore sepay_webhook_events theo sepay_id  ←── ĐIỂM IDEMPOTENT
  │   (duplicate → return 200 ngay, không xử lý lại)
  ├─ Filter: transferType ≠ 'in' → status='ignored', không cộng điểm
  ├─ Filter: amount < 1000 VND → status='ignored', không cộng điểm
  ├─ Match driver: User::whereHas('driverProfile', payment_code=code)
  │
  ├─ [MATCH] DB::transaction:
  │     1. WalletTransaction::create(type='topup', points=intdiv(amount,1000))
  │     2. wallets.points += points
  │     3. sepay_webhook_events.status='processed' + wallet_transaction_id + matched_user_id
  │     4. Dispatch DriverTopUpCompletedNotification (queued)
  │
  └─ [NO MATCH] status='unmatched' để admin đối soát tay
    ↓
Response 200 + {"success": true}
```

---

## Quy tắc chi tiết

### 1. Mã thanh toán của tài xế

- Format: `GCA` + `str_pad(user_id, 6, '0', STR_PAD_LEFT)` — ví dụ `GCA000123`.
- Sinh **1 lần duy nhất** khi tạo `driver_profile`, lưu vào `driver_profiles.payment_code` (UNIQUE).
- **Không cho đổi** — đây là định danh CK cố định dùng cả vòng đời tài xế.
- Khớp ưu tiên qua field `code` của Sepay (đã được extract sẵn từ memo theo prefix cấu hình trên dashboard Sepay).

### 2. Khi nào điểm được cộng

| Điều kiện | Kết quả |
|---|---|
| `transferType='in'` + match `payment_code` + `amount ≥ 1000` | `status='processed'`, cộng `intdiv(amount, 1000)` điểm |
| `transferType='in'` + không match `payment_code` | `status='unmatched'`, KHÔNG cộng điểm |
| `transferType='in'` + `amount < 1000` | `status='ignored'`, KHÔNG cộng điểm |
| `transferType='out'` | `status='ignored'`, KHÔNG cộng điểm (vẫn lưu event để audit) |
| `sepay_id` đã tồn tại | Bỏ qua (idempotent), KHÔNG cộng điểm lần 2 |

### 3. Không có hoàn / refund tự động

- Webhook không xử lý reversal. Nếu cần trừ điểm thủ công (vd Sepay báo nhầm), admin tạo `wallet_transaction` type=`debit` qua kênh khác (ngoài scope spec này).
- Tiền chuyển khoản nhầm không tự động refund — quy trình thủ công ngoài hệ thống.

### 4. Re-validation bắt buộc trong webhook

- Verify header `Authorization: Apikey <KEY>` so với `config('sepay.api_key')` trước mọi xử lý.
- Validate payload tối thiểu: `id`, `transferType`, `transferAmount` (numeric ≥ 0).
- Wrap toàn bộ cộng điểm trong `DB::transaction()` để tránh state nửa vời.

### 5. Hiển thị lịch sử cho tài xế

- `GET /driver/wallet/topups` trả **cả** event `processed` lẫn `unmatched` của chính tài xế đó (qua `matched_user_id`) — `unmatched` chỉ hiển thị nếu admin đã link tay sau này.
- WalletPage list giao dịch trộn cả `credit`, `debit`, `topup`. Icon `topup` dùng glyph riêng (vd 🏦) để phân biệt với thu nhập chuyến (`credit`).

---

## Sepay Webhook Contract

### Cấu hình trên dashboard Sepay
- URL: `https://<domain>/api/webhooks/sepay`
- Auth: **API Key** — header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`
- Event filter: **"Có tiền vào"** (incoming) + chọn TK công ty
- Payment code prefix: `GCA` (để Sepay tự extract vào field `code`)

### Payload (Sepay → backend)

```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2026-05-26 11:08:33",
  "accountNumber": "1017588888",
  "subAccount": "",
  "code": "GCA000123",
  "content": "GCA000123 nap diem",
  "transferType": "in",
  "description": "TAI XE A chuyen tien",
  "transferAmount": 500000,
  "accumulated": 50000000,
  "referenceCode": "FT26012345678"
}
```

| Field | Kiểu | Dùng để |
|---|---|---|
| `id` | int | UNIQUE idempotency key |
| `gateway` | string | Log + hiển thị (vd "Vietcombank") |
| `transactionDate` | datetime | Lưu `transaction_date` |
| `accountNumber` | string | Kiểm tra TK đích (optional whitelist) |
| `code` | string | Match `driver_profiles.payment_code` (ưu tiên) |
| `content` | text | Fallback regex tìm `GCA\d{6}` nếu `code` rỗng |
| `transferType` | enum('in','out') | Filter — chỉ xử lý `'in'` |
| `transferAmount` | int (VND) | Cộng điểm = `intdiv(amount, 1000)` |
| `accumulated`, `referenceCode`, `description`, `subAccount` | — | Lưu vào `raw_payload` để debug |

### Response (backend → Sepay)

| Tình huống | HTTP | Body |
|---|---|---|
| Xử lý ok (kể cả unmatched/ignored) | 200 | `{"success": true}` |
| Sai API key | 401 | `{"success": false, "error": "unauthorized"}` |
| Payload không parse được | 400 | `{"success": false, "error": "invalid_payload"}` |

> Sepay yêu cầu body **chính xác** `{"success": true}` để coi là thành công, không retry. Bất kỳ response khác → retry tới 7 lần trong 5h.

### Retry & timing
- Sepay timeout: 30s. Backend phải hoàn tất handler trong 30s.
- Notification dispatch (`DriverTopUpCompletedNotification`) là `ShouldQueue` → không block response.

---

## Schema

### `driver_profiles` (sửa)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `payment_code` | `varchar(16) UNIQUE` | `GCA` + zero-padded user_id, gen khi tạo profile |

### `wallet_transactions.type` (mở rộng enum)
```sql
ALTER TABLE wallet_transactions MODIFY type ENUM('credit','debit','topup') NOT NULL;
```

### `sepay_webhook_events` (tạo mới)
| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | bigIncrements | PK |
| `sepay_id` | `unsignedBigInteger UNIQUE` | Field `id` của Sepay |
| `gateway` | string | Tên ngân hàng |
| `account_number` | string | TK đích |
| `sub_account` | string nullable | VA |
| `code` | string nullable | Mã CK đã extract |
| `content` | text | Memo gốc |
| `transfer_type` | enum('in','out') | |
| `description` | text nullable | |
| `amount` | unsignedBigInteger | VND nguyên |
| `accumulated` | unsignedBigInteger nullable | Số dư sau giao dịch |
| `reference_code` | string nullable | Mã tham chiếu bank |
| `transaction_date` | dateTime | |
| `status` | enum('processed','unmatched','ignored') | Xem mục Quy tắc #2 |
| `matched_user_id` | FK users.id nullable | Driver khớp được |
| `wallet_transaction_id` | FK wallet_transactions.id nullable | Khi đã cộng điểm |
| `raw_payload` | json | Toàn bộ payload Sepay gốc |
| `timestamps` | | |

**Indexes:** `UNIQUE(sepay_id)`, `INDEX(transfer_type, status)`, `INDEX(matched_user_id)`.

---

## API Endpoints

| Method | Route | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/webhooks/sepay` | API Key header | Sepay POST event vào |
| GET | `/api/driver/wallet/topup-info` | `auth:sanctum` + `role:driver` | Thông tin nạp tiền cho UI |
| GET | `/api/driver/wallet/topups` | `auth:sanctum` + `role:driver` | 20 lần nạp gần nhất của driver hiện tại |

### `GET /driver/wallet/topup-info`
```json
{
  "bank": {
    "name": "Vietcombank",
    "account_number": "1017588888",
    "account_holder": "CTY TNHH GREEN CAR AIRPORT"
  },
  "payment_code": "GCA000123",
  "min_amount_vnd": 10000,
  "suggested_amounts": [50000, 100000, 200000, 500000],
  "qr_template_url": "https://img.vietqr.io/image/VCB-1017588888-compact2.png?addInfo=GCA000123&accountName=CTY+TNHH+GREEN+CAR+AIRPORT"
}
```

### `GET /driver/wallet/topups`
```json
[
  {
    "id": 12,
    "amount_vnd": 500000,
    "points_credited": 500,
    "status": "processed",
    "gateway": "Vietcombank",
    "reference_code": "FT26012345678",
    "transaction_date": "2026-05-26T11:08:33Z"
  }
]
```

---

## Cấu hình môi trường

```env
# backend/.env
SEPAY_WEBHOOK_API_KEY=<random-32-bytes>
SEPAY_BANK_NAME=Vietcombank
SEPAY_BANK_ACCOUNT_NUMBER=1017588888
SEPAY_BANK_ACCOUNT_HOLDER="CTY TNHH GREEN CAR AIRPORT"
```

`config/sepay.php`:
```php
return [
    'api_key'      => env('SEPAY_WEBHOOK_API_KEY'),
    'bank' => [
        'name'           => env('SEPAY_BANK_NAME', 'Vietcombank'),
        'account_number' => env('SEPAY_BANK_ACCOUNT_NUMBER'),
        'account_holder' => env('SEPAY_BANK_ACCOUNT_HOLDER'),
    ],
    'min_amount_vnd'    => 10000,
    'suggested_amounts' => [50000, 100000, 200000, 500000],
];
```

---

## UX — Frontend

### Route mới
`/driver/wallet/topup` — `RequireRole=driver`.

### TopUpPage layout
1. **Header**: tiêu đề "Nạp điểm" + nút quay lại.
2. **Card thông tin ngân hàng**: tên bank, số TK (nút copy), chủ TK.
3. **Card mã chuyển khoản**: hiển thị `payment_code` size to + nút copy + lưu ý _"Bắt buộc gõ chính xác mã này vào nội dung chuyển khoản"_.
4. **QR VietQR**: `<img src={qr_template_url}>` — quét sẵn STK + mã.
5. **Gợi ý số tiền**: chip 50k / 100k / 200k / 500k (decorative, không thực hiện CK trong app).
6. **Lịch sử nạp gần đây**: danh sách từ `/driver/wallet/topups`, mỗi item: ngày giờ, số tiền VND, +điểm, status badge (✓ Đã cộng / ⚠ Chưa khớp).
7. **Hướng dẫn 3 bước** (collapsed accordion).

### WalletPage
- Nút "Nạp điểm" hiện tại (`frontend/src/pages/driver/WalletPage.tsx:40-45`) đổi thành `<Link to="/driver/wallet/topup">`.
- Trong list transactions, transaction `type='topup'` hiển thị icon riêng (🏦 hoặc badge "Nạp") để phân biệt với `credit` (thu nhập chuyến).

### Notification (đã có hạ tầng từ push-notification-policy)
- Class: `DriverTopUpCompletedNotification` — `ShouldQueue`, channels: WebPushChannel + database.
- Title: `"Nạp điểm thành công"`.
- Body: `"+{points} điểm vào ví — {amount_vnd}đ qua {gateway}"`.
- Click action: `view_wallet` → navigate `/driver/wallet`.

---

## Files cần tạo/sửa

### Backend
| File | Thay đổi |
|---|---|
| `database/migrations/[ts]_add_payment_code_to_driver_profiles.php` | Tạo mới + backfill cho driver hiện có |
| `database/migrations/[ts]_add_topup_to_wallet_transactions_type_enum.php` | Tạo mới (raw `ALTER ENUM`) |
| `database/migrations/[ts]_create_sepay_webhook_events_table.php` | Tạo mới |
| `app/Models/SepayWebhookEvent.php` | Tạo mới |
| `app/Models/DriverProfile.php` | + `payment_code` vào `$fillable` |
| `app/Services/SepayWebhookService.php` | Tạo mới — toàn bộ logic process |
| `app/Http/Controllers/Webhooks/SepayWebhookController.php` | Tạo mới — controller mỏng, gọi service |
| `app/Http/Controllers/Driver/WalletController.php` | + `topupInfo()`, `topups()` |
| `app/Notifications/DriverTopUpCompletedNotification.php` | Tạo mới (theo mẫu các Notification có sẵn) |
| `app/Observers/DriverProfileObserver.php` (hoặc `creating` boot) | Gen `payment_code` khi tạo profile |
| `database/seeders/DriverProfileSeeder.php` | Set `payment_code = GCA000002` cho seed driver |
| `routes/api.php` | + `POST /webhooks/sepay` (public) + 2 route driver |
| `config/sepay.php` | Tạo mới |
| `.env.example` | + 4 biến SEPAY_* |

### Frontend
| File | Thay đổi |
|---|---|
| `src/api/wallet.ts` | + `getTopUpInfo()`, `getTopUpHistory()` |
| `src/types.d.ts` | + `App.TopUpInfo`, `App.TopUpEvent`; mở rộng `App.Transaction['type']` |
| `src/pages/driver/TopUpPage.tsx` | Tạo mới |
| `src/pages/driver/WalletPage.tsx` | Đổi nút "Nạp điểm" → Link; icon riêng cho `topup` |
| `src/router/index.tsx` | + route `/driver/wallet/topup` |

---

## Trường DB liên quan

| Bảng | Cột | Mô tả |
|---|---|---|
| `driver_profiles` | `payment_code` | Mã CK cố định, UNIQUE, không đổi |
| `wallet_transactions` | `type` | Mở rộng enum thêm `'topup'` |
| `wallet_transactions` | `description` | Format: `"Nạp điểm qua {gateway} — Ref {reference_code}"` |
| `sepay_webhook_events` | `sepay_id` | UNIQUE — idempotency anchor |
| `sepay_webhook_events` | `status` | `processed` / `unmatched` / `ignored` |
| `sepay_webhook_events` | `raw_payload` | JSON gốc Sepay — debug/audit |

---

## Verification

```bash
# 1. Fresh DB:
make fresh
# → driver_profiles có payment_code='GCA000002' cho user 2 ✓

# 2. Driver mở /driver/wallet/topup:
#    → Thấy STK Vietcombank, tên CTY, mã GCA000002, QR VietQR ✓

# 3. Test webhook:
curl -X POST http://localhost:8080/api/webhooks/sepay \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey ${SEPAY_WEBHOOK_API_KEY}" \
  -d '{"id":92704,"gateway":"Vietcombank","transactionDate":"2026-05-26 11:08:33","accountNumber":"1017588888","subAccount":"","code":"GCA000002","content":"GCA000002 nap diem","transferType":"in","description":"chuyen tien","transferAmount":500000,"accumulated":50000000,"referenceCode":"FT26012345678"}'
# → 200 {"success": true}
# → wallets.points của user 2 tăng 500 ✓
# → wallet_transactions: type='topup', points=500 ✓
# → sepay_webhook_events: status='processed', wallet_transaction_id non-null ✓
# → Driver nhận notification "Nạp điểm thành công +500 điểm" ✓

# 4. Idempotency — POST lại cùng payload:
#    → 200 {"success": true}, points KHÔNG tăng lần 2 ✓

# 5. Unmatched (code='GCAxxxxxx'):
#    → 200, event status='unmatched', không cộng điểm ✓

# 6. Ignored (transferType='out'):
#    → 200, event status='ignored' ✓

# 7. Amount < 1000:
#    → 200, event status='ignored', không tạo wallet_transaction ✓

# 8. Sai API key:
#    → 401, KHÔNG ghi vào DB ✓

# 9. GET /driver/wallet/topups:
#    → Trả về danh sách top-up của chính driver ✓

# 10. Lint + build:
make lint
docker compose exec frontend npm run build
```
