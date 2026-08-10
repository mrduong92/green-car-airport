# Hệ thống Campaign (khuyến mãi) — Design

**Ngày:** 2026-08-10
**Trạng thái:** đã chốt, chờ implement

## Mục tiêu

App mới ra mắt, cần chương trình thu hút khách: **khách đăng ký mới thành công
được tặng 4 voucher 50.000đ (tổng 200.000đ)**.

Không hardcode chương trình này vào code đăng ký. Quy hoạch thành **campaign** —
dữ liệu trong DB, admin tự bật/tắt và sửa tham số, sau này thêm loại chương trình
khác không phải đổi cấu trúc bảng.

## Phạm vi: hai phần, làm tuần tự

**Phần 1 — Cấp voucher thủ công cho một khách.** Nhỏ, dùng được ngay, không phụ
thuộc Phần 2. Đồng thời bịt một lỗ rò rỉ đang tồn tại.

**Phần 2 — Hệ thống campaign.** Dùng lại nguyên cơ chế voucher cá nhân của Phần 1;
khác biệt duy nhất là ai kích hoạt — admin bấm tay hay hệ thống tự chạy theo trigger.

### Cố ý KHÔNG làm

- Không có bảng `campaign_rules` hay hệ điều kiện tổng quát — hiện chỉ một loại event.
- Không có hệ thống template thông báo riêng cho campaign.
- Không đụng luồng referral hiện có; nó chạy song song, độc lập.
- Không có endpoint xoá campaign (lý do ở mục API).

---

## Phần 1 — Cấp voucher thủ công

### Lỗ hổng đang tồn tại

`AdminVoucherController::store` nhận `target` (`all` | `specific`) nhưng **không
nhận `user_id`**. Màn admin cũng không có ô chọn khách. Nên voucher tạo với
`target='specific'` có `user_id = NULL`.

`VoucherController` chỉ nhìn `user_id`, **không nhìn `target`**:

```php
// index() — danh sách công khai cho mọi khách
->whereNull('user_id')

// apply()
->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $request->user()->id))
```

Hệ quả: voucher admin tưởng cấp riêng cho một người thực tế **hiện trong danh sách
công khai và ai cũng áp được**. `formatVoucher` không trả `user_id` nên nhìn màn
admin không phát hiện ra.

Đã kiểm production: **0 voucher** đang ở trạng thái `target='specific'` +
`user_id IS NULL`. Siết lại không làm hỏng dữ liệu nào, không cần migration dữ liệu.

### Thay đổi

`AdminVoucherController::store` nhận thêm `user_id` (nullable, `exists:users,id`),
với ràng buộc chéo:

| `target` | `user_id` |
|---|---|
| `specific` | **bắt buộc** |
| `all` | **phải** null |

`formatVoucher` trả thêm `user_id` và `{phone, name}` của khách, để admin nhìn được
voucher thuộc về ai.

`VoucherController::index()` thêm `where('target', 'all')` — voucher cá nhân không
được lọt vào danh sách công khai.

`VoucherController::apply()` — voucher `target='specific'` chỉ áp được khi `user_id`
khớp người đang đăng nhập.

Màn admin: thêm ô tìm khách theo số điện thoại khi chọn `target='specific'`.

---

## Phần 2 — Hệ thống campaign

### Bảng `campaigns`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigint PK | |
| `name` | string(100) | Tên admin nhìn |
| `trigger` | string(50) | `customer_registered` |
| `reward` | json | `{voucher_count, voucher_value, voucher_expires_days}` |
| `conditions` | json nullable | **Chưa dùng** — xem "Mở rộng sau này" |
| `starts_at` | datetime nullable | null = không giới hạn đầu |
| `ends_at` | datetime nullable | null = không giới hạn cuối |
| `max_grants` | uint nullable | null = không trần |
| `grants_count` | uint default 0 | Đã phát bao nhiêu |
| `is_active` | bool default true | Công tắc tức thì |

Index `(is_active, trigger)`.

**`trigger` là `string`, KHÔNG phải `enum`** — có chủ ý. Thêm giá trị vào cột `enum`
của MySQL phải `ALTER TABLE` trên bảng đang chạy; dùng `string` + validate bằng hằng
số PHP thì thêm loại event chỉ là sửa code.

Giá trị hợp lệ khai trong `App\Support\CampaignTrigger`, validate ở tầng request.

### Bảng `campaign_grants`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigint PK | |
| `campaign_id` | FK → campaigns | cascade on delete |
| `user_id` | FK → users nullable | `nullOnDelete` |
| `phone` | string(20) | Bản chụp số điện thoại lúc phát |
| `granted_at` | datetime | |

**UNIQUE `(campaign_id, phone)`.**

Khoá chống trùng đặt trên `phone` chứ không phải `user_id`: khách xoá tài khoản rồi
đăng ký lại sẽ có `user_id` mới và nhận thưởng lần hai. `user_id` giữ để truy vết
nhưng `nullOnDelete` nên không dùng làm khoá được.

Ràng buộc nằm ở **tầng database**, không phải chỉ kiểm trong PHP.

### Thêm `vouchers.campaign_id`

Cột nullable, FK → campaigns, `nullOnDelete`.

Không có cột này thì không trả lời được *"chiến dịch tiêu tốn bao nhiêu, khách dùng
bao nhiêu"* — voucher từ campaign và từ referral nằm lẫn nhau. Đo hiệu quả chính là
lý do làm hệ thống campaign.

Voucher referral và voucher admin cấp tay để `campaign_id = NULL`.

---

## Luồng chạy

```
AuthController::register()
  ├─ tạo user
  ├─ tạo token
  └─ CampaignService::runOnCustomerRegistered($user)     ← đúng 1 dòng
```

`AuthController` không biết gì về luật campaign — nó chỉ gọi.

### Ranh giới trách nhiệm

| Thành phần | Việc duy nhất | Phụ thuộc |
|---|---|---|
| `Campaign` | Trả lời "còn hiệu lực không" | — |
| `CampaignGrant` | Ghi ai đã nhận, chống phát trùng | `Campaign` |
| `CampaignService` | Quyết định phát/không, phát bao nhiêu | 2 model trên + `VoucherIssuer` |
| `VoucherIssuer` | Tạo voucher cá nhân đúng chuẩn | `Voucher` |
| `AuthController` | Đăng ký; chỉ gọi service | `CampaignService` |

`ReferralService::issueVouchers()` hiện tự tạo voucher — cho nó dùng chung
`VoucherIssuer` để logic tạo voucher cá nhân chỉ nằm một chỗ. Trùng lặp kiểu này
đúng là thứ đã gây bug push noti ngày 08/08 (quy tắc sức chứa nằm hai nơi, lệch nhau).

`CampaignService` tách bạch **kiểm điều kiện** khỏi **phát thưởng** — hàm
`eligible(Campaign, User): bool` riêng. Đây mới là thứ khiến mở rộng dễ hay khó, chứ
không phải việc có sẵn cột hay không.

---

## Chống tranh chấp

Hai người đăng ký cùng lúc khi còn một suất cuối.

**Không dùng `lockForUpdate()`** — nó bắt mọi lượt đăng ký xếp hàng chờ nhau trên một
hàng dữ liệu. Dùng **UPDATE có điều kiện, nguyên tử**:

```php
$claimed = Campaign::where('id', $id)
    ->where('is_active', true)
    ->where(fn ($q) => $q->whereNull('max_grants')
                         ->orWhereColumn('grants_count', '<', 'max_grants'))
    ->increment('grants_count');

if ($claimed === 0) return;   // hết trần, hoặc vừa bị tắt
```

MySQL đánh giá `WHERE` trên giá trị hiện tại tại thời điểm ghi, nên "kiểm còn suất"
và "chiếm suất" là **một thao tác duy nhất**, không có khe hở.

Hai lớp bảo vệ:

| Lớp | Chặn |
|---|---|
| `UPDATE ... WHERE grants_count < max_grants` | Vượt trần khi đăng ký đồng thời |
| `UNIQUE (campaign_id, phone)` ở tầng DB | Một số điện thoại nhận hai lần |

Thứ tự trong transaction: **chiếm suất → ghi sổ → phát voucher**. Nếu ghi sổ đụng
UNIQUE thì transaction rollback cả phần đã tăng `grants_count`.

---

## Xử lý lỗi

> **Lỗi phát thưởng KHÔNG bao giờ được làm hỏng việc đăng ký.**

Khách đăng ký xong nhận 500 vì hệ thống khuyến mãi trục trặc là mất khách thật để
đổi lấy một món quà.

```php
try {
    DB::transaction(fn () => $this->grant($campaign, $user));
} catch (UniqueConstraintViolationException) {
    // Đã nhận rồi — bình thường, bỏ qua lặng lẽ
} catch (\Throwable $e) {
    Log::error('[Campaign] phát thưởng thất bại', [...]);   // KHÔNG ném lên
}
```

Khi phát thất bại khách không có voucher và không ai biết, nên log phải đủ rõ để
admin **cấp tay bù** bằng chức năng ở Phần 1. Hai phần bổ trợ nhau.

### Chạy đồng bộ, không qua queue

Khách đăng ký xong mở app **thấy voucher ngay** — đó là giá trị của khuyến mãi ra mắt.
Qua queue thì có độ trễ, mà queue đang là điểm nghẽn đã ghi trong `docs/BACKLOG.md`.

Chi phí: 1 UPDATE + 1 INSERT sổ + `voucher_count` INSERT voucher (4 với chiến dịch
đầu tiên) — vài mili giây.

---

## Hai thời hạn, đừng lẫn

| | Cột | Nghĩa |
|---|---|---|
| Thời hạn **chiến dịch** | `starts_at` / `ends_at` | Khoảng thời gian khách đăng ký thì được nhận |
| Thời hạn **voucher** | `reward.voucher_expires_days` | Voucher sống bao lâu **kể từ ngày phát** |

Cả hai đều admin đặt, không hardcode.

Voucher tính hạn từ **ngày phát**, nên voucher có thể sống lâu hơn chiến dịch: khách
nhận ngày cuối vẫn dùng được đủ số ngày của mình. Đây là lựa chọn có cân nhắc —
voucher là lời hứa với từng khách, không nên chết theo lịch nội bộ.

Ràng buộc: `voucher_expires_days` trong khoảng **1–365**, `voucher_count` **1–20**,
`voucher_value` **≥ 1.000**. Chặn admin gõ nhầm 9000 ngày hay 400 voucher.

### Cấu hình cho chiến dịch đầu tiên

```
name:       Ra mắt — tặng 200k khách mới
trigger:    customer_registered
starts_at:  null          ← chạy ngay khi tạo; admin đặt ngày cụ thể nếu muốn hẹn giờ
ends_at:    null          ← chưa chốt ngày đóng; dừng bằng is_active hoặc khi hết trần
max_grants: 1000
reward:     { voucher_count: 4, voucher_value: 50000, voucher_expires_days: 90 }
```

Chiến dịch đầu tiên **không đặt ngày đóng** — dừng khi đủ 1.000 người hoặc khi admin
tắt. Ngày tháng là dữ liệu admin nhập lúc tạo, không phải quyết định cần chốt ở spec này.

Trần 1.000 người chốt chi phí tối đa ở **200 triệu**. Chi phí để một người lấy 200k
voucher là 365đ tiền OTP, nên trần là bắt buộc, không phải tuỳ chọn.

---

## API

### Phần 1

```
POST /api/admin/vouchers        + user_id (nullable, exists:users,id)
GET  /api/admin/vouchers        formatVoucher trả thêm user_id + {phone, name}
```

### Phần 2

```
GET    /api/admin/campaigns          danh sách + grants_count/max_grants
POST   /api/admin/campaigns          tạo
PATCH  /api/admin/campaigns/{id}     sửa: is_active, ngày, trần, reward
```

**Không có endpoint xoá.** Xoá campaign làm mất luôn sổ `campaign_grants` (cascade),
khách đăng ký lại sẽ nhận được lần hai. Muốn dừng thì tắt `is_active`.

---

## Test

Chạy **trên MySQL**, không phải sqlite mặc định: `UNIQUE` và `UPDATE ... WHERE` là
hành vi DB thật. Đây đúng lỗ hổng đã làm lọt bug 500 trang Doanh thu (xem
`docs/BACKLOG.md` P2).

### Phần 2 — campaign

| # | Kiểm |
|---|---|
| 1 | Campaign chạy → nhận đúng `voucher_count` voucher, đúng mệnh giá, đúng hạn, `target=specific`, đúng `user_id` và `campaign_id` |
| 2 | Không có campaign nào → không voucher nào |
| 3 | `is_active = false` → không phát |
| 4 | Ngoài `starts_at`/`ends_at` → không phát |
| 5 | Đã đạt `max_grants` → không phát, `grants_count` không tăng |
| 6 | Xoá user rồi đăng ký lại cùng SĐT → không nhận lần hai |
| 7 | Lỗi khi phát voucher → đăng ký vẫn thành công, có log |
| 8 | `grants_count` tăng đúng 1 mỗi lần phát |
| 9 | `max_grants=1`, gọi service cho 2 user → chỉ 1 người nhận |

Test 9 kiểm **logic trần**, không phải tranh chấp thật — PHPUnit chạy tuần tự. Bảo
đảm cho tranh chấp thật đến từ `UNIQUE` ở tầng DB và `UPDATE` nguyên tử.

### Phần 1 — cấp tay

| # | Kiểm |
|---|---|
| 10 | `target=specific` thiếu `user_id` → 422 |
| 11 | `target=all` kèm `user_id` → 422 |
| 12 | Voucher `specific` không hiện trong danh sách công khai |
| 13 | Khách A không áp được voucher `specific` của khách B |
| 14 | Khách B áp được voucher của chính mình |

Test 12–13 là hồi quy cho lỗ rò rỉ ở Phần 1.

---

## Mở rộng sau này

Cột `conditions` (json nullable) **đã có sẵn trong migration nhưng chưa có code nào
đọc**. Cố ý — thêm cột vào bảng đang có dữ liệu thật thì phiền hơn để sẵn.

### Loại chương trình mở rộng được ngay, không cần migration

Thêm một giá trị vào `CampaignTrigger` + một nhánh trong `CampaignService`:

| Chương trình | Cấu hình |
|---|---|
| Tết — khách mở app trong dịp được nhận | `trigger: customer_logged_in`, đặt `starts_at`/`ends_at` |
| Phát cho toàn bộ khách hiện có | `trigger: manual_bulk`, admin bấm nút → job duyệt user, gọi đúng hàm phát thưởng đó |
| Thưởng tài xế mới được duyệt | `trigger: driver_approved`, `reward` chứa số điểm ví thay vì voucher |

`max_grants` và `campaign_grants` vẫn chặn trùng và chặn vượt trần y hệt.

### Chỗ CẦN dùng tới `conditions`

Khi muốn lọc theo **thuộc tính của khách** chứ không phải "ai kích hoạt":

> *"chỉ khách chưa đi chuyến nào"*, *"chỉ khách ở Hà Nội"*, *"chỉ khách đã đi trên 5 chuyến"*

Lúc đó điền `conditions` và viết code đọc nó trong `CampaignService::eligible()` —
chỉ sửa một hàm, không đụng cấu trúc.
