# Chính sách Affiliate / Giới thiệu Khách Hàng

**Cập nhật:** 2026-10-15 — theo `docs/superpowers/specs/2026-10-15-affiliate-design.md` (triển khai nhánh `feat/affiliate`, các mục 1, 2, 5, 6 của `docs/CR/2026-10-04-CR-affiliate.md`).
**Phạm vi:** toàn bộ khách hàng (không riêng CTV). Tài xế không tham gia hệ thống điểm thưởng này.

---

## Tổng quan

Mỗi chuyến **hoàn thành** của khách → khách nhận **5% giá chuyến** (sau voucher) dưới dạng **điểm thưởng**. Nếu khách đó là F1 (được giới thiệu) của một khách khác, người giới thiệu nhận thêm **5%** giá chuyến đó vào điểm thưởng của mình (hoa hồng F1, trọn đời, chỉ 1 tầng, không có F2).

Điểm thưởng dùng để **trừ thẳng vào cuốc tiếp theo** khi đặt xe (tối đa 10% giá chuyến), không đổi được voucher, không rút tiền mặt. Khoản giảm này do **phí app** gánh — tài xế luôn nhận đủ 80% giá chuyến dù khách có dùng điểm hay không.

Ngoài ra, khi một khách mới đăng ký bằng mã giới thiệu của một khách khác, người giới thiệu vẫn nhận ngay **voucher 100.000đ** như trước (cơ chế này giữ nguyên, không đổi).

---

## Mã giới thiệu

**Mã giới thiệu = Số điện thoại của khách hàng.** Các mã kiểu cũ (`GCA-XXXXXX`, sinh tự động cho mỗi user) **vẫn được chấp nhận** — link/mã cũ đã chia sẻ không bị hỏng.

Khi đăng ký, trường "Mã giới thiệu" nhận một trong hai dạng:
- **Số điện thoại** (mọi định dạng `0…`, `84…`, `+84…`) — được chuẩn hoá rồi tra theo cột `phone`; ưu tiên tài khoản cùng role với form đang đăng ký, sau đó ưu tiên `driver`.
- **Mã chữ-số kiểu cũ** (không phải số điện thoại, ví dụ `GCA-AB12CD`) — tra theo cột `referral_code` (không phân biệt hoa thường).

Không thể tự giới thiệu bản thân (so khớp loại trừ số điện thoại của chính người đăng ký). Việc này nằm trong `App\Services\ReferralService::findReferrer()` — không đổi ở đợt này.

---

## Định nghĩa

- **Điểm thưởng** (`reward_points`, trên `wallets`): 1 điểm = 1.000đ. Chỉ dùng để trừ vào cuốc; **không rút, không đổi voucher**. Khác **điểm ví** (`points`) hiện có của CTV (trả phí nhận cuốc, nhận thu hộ — rút qua kế toán); hai loại điểm tách biệt hoàn toàn trong lịch sử giao dịch (`wallet_transactions.balance = reward|points`).
- **Giá cơ sở** của một chuyến = `price − discount` (giá sau voucher; **không gồm** `surcharge` phạt huỷ và `collection_fee` thu hộ) — cùng cơ sở tính với phí app 20% hiện có.
- **F1** của khách A = một khách hàng khác (role `customer`) có `referred_by_user_id = A.id`. Chỉ tính khi **người giới thiệu (A) cũng là khách hàng** — nếu A là tài xế thì F1 (B) vẫn được hoàn điểm cho chính mình, nhưng không ai nhận hoa hồng. Chỉ 1 tầng (không có F2, F3…).
- Làm tròn **xuống** (floor) khi quy đổi tiền → điểm, ở mọi bước (hoàn điểm, hoa hồng, trần dùng điểm).

---

## Quy tắc nghiệp vụ

1. **Hoàn điểm cho khách**: mỗi chuyến hoàn thành, khách nhận `⌊cashback% × giá cơ sở / 1.000⌋` điểm. Mặc định `cashback% = 5`.
2. **Hoa hồng cho người giới thiệu**: nếu khách vừa hoàn thành chuyến là F1 của một khách khác, người giới thiệu nhận thêm `⌊commission% × giá cơ sở / 1.000⌋` điểm. Mặc định `commission% = 5`. **Chỉ áp dụng khi người giới thiệu có role `customer`** — khách do tài xế giới thiệu vẫn được hoàn điểm mục 1 bình thường, chỉ là không ai nhận hoa hồng.
3. Chỉ cộng điểm khi chuyến chuyển sang `completed`, và **mỗi chuyến cộng tối đa một lần** (ghi `cashback_points`, `commission_points` trên booking — cộng lần hai không ghi đè, không cộng lại nếu job/endpoint bị gọi lại).
4. **Nguồn chi trả**: phí app (20% giá cơ sở). Thu nhập tài xế **không đổi**.
5. **Dùng điểm khi đặt**: khách bật công tắc "Dùng điểm". Server tự tính `points_used = min(số dư hiện có, ⌊max_rate% × giá cơ sở / 1.000⌋)` — mặc định `max_rate% = 10`. Điểm bị **trừ (giữ) ngay khi tạo đơn**, không chờ hoàn thành.
6. **Dùng cùng voucher**: voucher vẫn ≤ 10% `price` (không đổi); điểm ≤ `max_rate%` × giá cơ sở (giá đã trừ voucher). Tổng mức giảm tối đa khoảng 19%.
7. **Bù tài xế**: phí app trừ lúc tài xế nhận cuốc = `phí app gốc − points_used`. Tài xế thu tiền mặt của khách ít hơn đúng `points_used × 1.000đ`, nhưng cũng bị trừ phí ít hơn đúng chừng đó → vẫn nhận đủ **80% giá cơ sở**, không phụ thuộc khách có dùng điểm hay không. (`points_used` tối đa 10%, luôn nhỏ hơn phí app 20% nên phí trừ lúc nhận cuốc không bao giờ âm.)
8. **Hoàn điểm đã dùng**: khách huỷ, admin huỷ, hoặc đơn tự hết hạn (lệnh `bookings:expire`, khi đơn còn `finding_driver` sau 24h) → hoàn đủ `points_used` về ví, một lần (đánh dấu qua `points_refunded_at`, chống hoàn hai lần). **Tài xế huỷ** → đơn quay về `finding_driver` để tìm tài xế khác, điểm khách đã dùng **vẫn giữ nguyên** (không hoàn, vì đơn còn hiệu lực).
9. Ba tỷ lệ `cashback%`, `commission%`, `max_rate%` admin chỉnh được ở trang **Cài đặt**; thay đổi áp dụng cho chuyến hoàn thành / đơn đặt **sau** thời điểm đổi (không hồi tố). Server từ chối lưu nếu `max_rate%` > phí app hiện hành (app không thể bù nhiều hơn phí thu được).
10. Danh sách F1 hiển thị số điện thoại **che bớt** (ví dụ `0912***678`).
11. Không cộng hồi tố cho các chuyến đã hoàn thành trước khi tính năng này phát hành. Điểm thưởng **không hết hạn**.

---

## Ví dụ minh hoạ

Chuyến giá 500.000đ của khách F1 (được một khách khác giới thiệu), không dùng voucher, không dùng điểm:

| Bên | Số tiền/điểm |
|---|---|
| Giá cơ sở | 500.000đ |
| Phí app (20%) | 100.000đ |
| Tài xế nhận (80%) | **400.000đ** |
| Khách F1 được hoàn (5%) | **25 điểm** (25.000đ) |
| Người giới thiệu nhận hoa hồng (5%) | **25 điểm** (25.000đ) |
| App còn lại sau khi trả hoàn + hoa hồng | 100.000 − 25.000 − 25.000 = **50.000đ** |

Nếu khách này đồng thời **dùng điểm** để giảm giá chuyến (ví dụ dùng 50 điểm = 50.000đ, đúng trần 10%): tài xế vẫn nhận đủ 400.000đ; phí app trừ lúc tài xế nhận cuốc chỉ còn 100.000 − 50.000 = 50.000đ (khách trả tài xế tiền mặt ít hơn 50.000đ, tài xế bị trừ phí ít hơn đúng 50.000đ nên tổng không đổi).

---

## Kiến trúc dữ liệu

- `wallets.reward_points` — unsigned int, mặc định 0. Tách biệt với `wallets.points` (điểm CTV hiện có).
- `wallet_transactions.balance` — `points` (mặc định, mọi giao dịch cũ) hoặc `reward` (giao dịch điểm thưởng).
- `wallet_transactions.kind` — nullable: `cashback`, `commission`, `spend`, `refund` cho giao dịch điểm thưởng (`type` vẫn giữ `credit`/`debit` như cũ).
- `bookings.points_used` (unsigned int, mặc định 0), `bookings.cashback_points`, `bookings.commission_points` (nullable — null nghĩa là chưa quyết toán), `bookings.points_refunded_at` (nullable — chốt hoàn điểm một lần, chống hoàn trùng).
- `App\Services\AffiliateService`: `rewardPoints()` (công thức làm tròn dùng chung), `spendable()` (tính trần dùng điểm), `hold()` (giữ điểm lúc đặt), `refund()` (hoàn điểm khi huỷ/hết hạn — idempotent qua `points_refunded_at`), `settle()` (cộng hoàn + hoa hồng khi hoàn thành — idempotent qua `cashback_points IS NULL`).
- `App\Models\AppSetting`: `AFFILIATE_CASHBACK_PERCENT`, `AFFILIATE_COMMISSION_PERCENT`, `POINTS_MAX_RATE_PERCENT` — mặc định 5 / 5 / 10 (`config/business.php`), admin ghi đè qua trang Cài đặt.

## API

| Method | Route | Mô tả |
|---|---|---|
| `GET` | `/api/customer/reward-wallet` | Số dư `reward_points`, 3 tỷ lệ hiện hành |
| `GET` | `/api/customer/reward-wallet/transactions` | Lịch sử điểm thưởng (phân trang) |
| `GET` | `/api/customer/referrals?month=YYYY-MM` | Tổng F1, F1 tháng này, biểu đồ 12 tháng, danh sách F1 (SĐT che, ngày đăng ký, số chuyến, tổng chi tiêu, hoa hồng đã nhận) |
| `GET` | `/api/admin/referrals?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day\|week\|month` | Top 10 người giới thiệu theo doanh số F1 trong khoảng ngày lọc (mặc định 30 ngày gần nhất, nhóm theo ngày), biểu đồ F1 đăng ký + doanh số F1 theo bucket ngày/tuần/tháng |
| `GET` | `/api/admin/referrals/{user}` | Chi tiết một người giới thiệu |

## Giao diện

- App khách: trang **Ví điểm thưởng** (`/customer/reward-wallet`, lối vào ở Hồ sơ), công tắc "Dùng điểm" ở `BookingFormPage`, dòng "Điểm: −X đ" ở `BookingStatusPage`, trang **Bạn bè đã giới thiệu** (`/customer/referrals`) từ bottom sheet "Giới thiệu bạn bè" ở Hồ sơ.
- App tài xế: `TripDetailPage` hiển thị dòng "Khách dùng X điểm — app bù" khi `points_used > 0`.
- Admin: trang **Giới thiệu** (menu mới) — bộ lọc khoảng ngày (preset + 2 ô ngày + nhóm ngày/tuần/tháng), top 10, biểu đồ; trang **Cài đặt** thêm 3 ô tỷ lệ affiliate.

## Thông báo

Queued (database + WebPush): "Bạn nhận X điểm từ chuyến …" cho khách hoàn thành chuyến; "Bạn nhận X điểm hoa hồng từ chuyến của bạn bè" cho người giới thiệu.

## Ngoài phạm vi (chưa làm)

Đổi điểm thưởng lấy voucher; rút điểm thưởng; hoa hồng F2 trở lên; điểm thưởng hết hạn; cộng hồi tố cho chuyến đã hoàn thành trước khi phát hành; hoa hồng cho tài xế khi giới thiệu khách.

## Luồng voucher 100k khi F1 đăng ký (giữ nguyên, không đổi ở đợt này)

```
Khách A chia sẻ SĐT (hoặc mã GCA- cũ) cho bạn bè
    ↓
Khách B đăng ký, nhập mã giới thiệu → ReferralService::findReferrer() ghi referred_by_user_id = A.id
    ↓
ReferralService::processCustomerReferral() cấp ngay voucher 100.000đ (target='specific', user_id=A.id) cho Khách A
```

Từ đây trở đi, **mỗi chuyến hoàn thành của B** còn kích hoạt thêm cơ chế hoàn điểm + hoa hồng mô tả ở trên — không giới hạn ở chuyến đầu tiên, và không giới hạn thời gian (áp dụng trọn đời quan hệ giới thiệu).
