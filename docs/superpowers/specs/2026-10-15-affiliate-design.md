# Affiliate — hoàn điểm 5%, hoa hồng F1 5%, dùng điểm trừ vào cuốc, báo cáo giới thiệu

**Ngày:** 2026-10-15
**Nguồn:** `docs/CR/2026-10-04-CR-affiliate.md`, báo giá `docs/Bao_gia_CR_Affiliate.md` v1.2 (8 quy tắc Phần 3 — GreenCA **đã chốt nguyên như báo giá**).
**Phạm vi:** yêu cầu 1, 2, 5, 6 của CR (3 và 4 đã chạy trên production). Áp dụng **toàn bộ khách hàng**.

## Mục tiêu

Khách hàng tích điểm từ chuyến của mình và của người mình giới thiệu, dùng điểm giảm giá chuyến sau; tài xế không bị giảm thu nhập; khách và admin xem được hiệu quả giới thiệu.

Thành công khi:
- Chuyến hoàn thành → khách nhận 5% (giá − voucher) dạng điểm; nếu khách là F1 của một **khách** khác, người đó nhận thêm 5%.
- Khách bật "Dùng điểm" khi đặt → giảm tối đa 10% (giá − voucher); huỷ thì hoàn điểm.
- Tài xế nhận đúng 80% (giá − voucher) dù khách dùng điểm.
- Khách xem F1 của mình; admin xem top 10, F1 đăng ký và doanh số F1 theo tháng.

## Định nghĩa

- **Điểm**: 1 điểm = 1.000đ. Làm tròn **xuống** khi quy đổi tiền → điểm.
- **Giá cơ sở** của chuyến = `price − discount` (giá sau voucher; không gồm `surcharge` phạt huỷ và `collection_fee` thu hộ) — cùng cơ sở với phí app 20% (`Booking::appFeePoints`).
- **F1** của khách A = khách (role `customer`) có `referred_by_user_id = A.id` và **A cũng là khách**. Chỉ 1 tầng.
- **Điểm thưởng** (`reward_points`) = điểm hoàn + hoa hồng. Chỉ dùng để trừ vào cuốc; không rút, không đổi voucher. Khác **điểm ví** (`points`) hiện có (tài xế trả phí; CTV nhận thu hộ — rút qua kế toán).

## Quy tắc nghiệp vụ (đã chốt)

1. Hoàn khách = ⌊`cashback%` × giá cơ sở / 1000⌋ điểm, mặc định `cashback% = 5`.
2. Hoa hồng người giới thiệu = ⌊`commission%` × giá cơ sở / 1000⌋ điểm, mặc định 5. Chỉ khi người giới thiệu là **khách**; khách do **tài xế** giới thiệu vẫn được hoàn cho mình nhưng không ai nhận hoa hồng.
3. Chỉ cộng khi chuyến chuyển sang `completed`. Mỗi chuyến cộng tối đa một lần (lưu `cashback_points`, `commission_points` trên booking).
4. Nguồn chi trả: phí app. Tài xế không đổi.
5. Dùng điểm khi đặt: công tắc "Dùng điểm" — bật thì `points_used = min(reward_points, ⌊max_rate% × giá cơ sở / 1000⌋)`, mặc định `max_rate% = 10`. Điểm bị trừ (giữ) ngay khi tạo đơn.
6. Dùng cùng voucher: voucher ≤ 10% `price` (như cũ); điểm ≤ `max_rate%` × (price − discount). Tổng giảm tối đa ~19%.
7. Bù tài xế: phí trừ lúc nhận cuốc = `appFeePoints − points_used`. Tài xế thu tiền mặt ít hơn đúng `points_used` × 1000đ và bị trừ phí ít hơn đúng chừng đó → vẫn nhận 80% giá cơ sở. (`points_used` ≤ 10% < 20% nên phí luôn ≥ 0.)
8. Hoàn điểm đã dùng: khách huỷ, admin huỷ, đơn hết hạn khi `finding_driver` → hoàn đủ `points_used` (một lần). Tài xế huỷ → đơn về `finding_driver`, điểm vẫn giữ.
9. Ba tỷ lệ (`cashback%`, `commission%`, `max_rate%`) admin chỉnh ở Cài đặt; áp dụng cho chuyến hoàn thành / đơn đặt **sau** thời điểm đổi.
10. Danh sách F1 hiển thị SĐT che bớt (`0912***678`).
11. Không cộng hồi tố cho chuyến hoàn thành trước khi phát hành. Điểm không hết hạn.

## Kiến trúc

### Dữ liệu (migration mới, không đổi dữ liệu cũ)

- `wallets.reward_points` — unsigned int, default 0.
- `wallet_transactions.balance` — enum `points|reward`, default `points` (mọi giao dịch cũ là `points`).
- `wallet_transactions.type` thêm: `cashback`, `commission`, `reward_spend`, `reward_refund` (ALTER ENUM, bỏ qua trên sqlite như các migration trước).
- `bookings.points_used` (unsigned int, default 0), `bookings.cashback_points` (nullable), `bookings.commission_points` (nullable).

### Backend

- `Wallet`: `creditReward()` / `debitReward()` (cùng khoá `lockedFor`), ghi giao dịch `balance=reward`. Số dư không đủ → ném lỗi, không âm.
- `AffiliateService` (mới):
  - `spendablePoints(User, int $base): int` — trần theo `max_rate%` và số dư.
  - `holdPoints(Booking)` khi tạo đơn; `refundPoints(Booking)` khi huỷ/hết hạn (atomic, chỉ một lần — đánh dấu bằng giao dịch `reward_refund` gắn booking hoặc cột cờ).
  - `settle(Booking)` khi hoàn thành: cộng hoàn khách + hoa hồng, ghi `cashback_points`/`commission_points`; bỏ qua nếu đã có.
- `AppSetting`: `AFFILIATE_CASHBACK_PERCENT`, `AFFILIATE_COMMISSION_PERCENT`, `POINTS_MAX_RATE_PERCENT` (+ default ở `config/business.php`, + `AppSettingController`).
- Điểm nối:
  - `StoreBookingRequest` thêm `use_points` (boolean). `BookingController::store` gọi `holdPoints` trong transaction tạo đơn.
  - `Booking::chargedOnAccept()` / phí lúc nhận cuốc trừ `points_used`; `formatTrip` hiển thị phí đã trừ và `points_used`.
  - `TripController::settleCompletion` gọi `AffiliateService::settle` trong transaction; thông báo sau transaction.
  - Huỷ bởi khách (`BookingController::cancel`), admin, `ExpireStaleBookings` → `refundPoints`.
  - `final_price` mọi nơi (BookingController, TripController, StatsController) trừ `points_used × 1000`.
  - `CollaboratorWalletController` chỉ lấy giao dịch `balance=points` (không lẫn điểm thưởng).
- API mới:
  - `GET /api/customer/reward-wallet` → `reward_points`, `max_rate_percent`, `cashback_percent`, `commission_percent`; `GET /api/customer/reward-wallet/transactions` (phân trang).
  - `GET /api/customer/referrals?month=YYYY-MM` → `total_f1`, `f1_this_month`, `monthly` (12 tháng: số F1 đăng ký), `items` (F1: tên, SĐT che, ngày đăng ký, số chuyến hoàn thành, tổng chi tiêu, hoa hồng đã nhận — lọc theo tháng phát sinh chuyến).
  - `GET /api/admin/referrals?month=YYYY-MM` → `top` (10 người giới thiệu theo doanh số F1 trong tháng, kèm số F1, hoa hồng), `monthly` (12 tháng: F1 đăng ký, doanh số F1 = Σ giá cơ sở chuyến hoàn thành của F1, tổng điểm hoàn + hoa hồng); `GET /api/admin/referrals/{user}` chi tiết một người giới thiệu.
- Thông báo (queued, database + WebPush): "Bạn nhận X điểm từ chuyến …" cho khách; "Bạn nhận X điểm hoa hồng từ chuyến của bạn bè" cho người giới thiệu.

### Frontend

- App khách:
  - Trang `Ví điểm` (`/customer/reward-wallet`): số dư, lịch sử (hoàn / hoa hồng / dùng / hoàn lại), dòng giải thích tỷ lệ. Lối vào ở Hồ sơ. CTV vẫn có ví thu hộ riêng.
  - `BookingFormPage`: công tắc "Dùng điểm (−X đ)" dưới phần voucher, ẩn khi số dư 0; tổng tiền ở footer trừ điểm; gửi `use_points`.
  - `BookingStatusPage`: dòng "Điểm: −X đ".
  - Trang `Bạn bè đã giới thiệu` từ bottom sheet "Giới thiệu bạn bè" ở Hồ sơ: số F1 tổng/tháng này, biểu đồ cột 12 tháng (nhỏ), danh sách F1 lọc theo tháng.
- App tài xế: `TripDetailPage` thêm dòng "Khách dùng X điểm — app bù" khi `points_used > 0`; phí hiển thị = phí đã trừ.
- Admin: trang `Giới thiệu` (menu mới): bộ chọn tháng, top 10, biểu đồ F1 đăng ký + doanh số F1 theo tháng (Chart.js như RevenuePage), bấm một người để xem chi tiết; Cài đặt thêm 3 ô tỷ lệ.

## Xử lý lỗi

- Bật "Dùng điểm" nhưng số dư thay đổi giữa lúc xem và lúc đặt → server tự tính lại theo số dư thực (không báo lỗi; đơn ghi đúng `points_used`).
- Tỷ lệ đổi giữa lúc đặt và lúc hoàn thành → `points_used` cố định theo lúc đặt; hoàn/hoa hồng theo tỷ lệ lúc hoàn thành.
- Hoàn điểm và cộng điểm đều idempotent (job/endpoint gọi lại không cộng hai lần).

## Kiểm thử

- Backend (PHPUnit): cách tính & làm tròn; trần 10% và kết hợp voucher; số dư không đủ; giữ/hoàn điểm cho từng đường huỷ; tài xế huỷ giữ điểm; phí nhận cuốc trừ `points_used` và tài xế nhận đủ 80%; hoàn thành cộng hoàn + hoa hồng; F1 do tài xế giới thiệu không có hoa hồng; không cộng hai lần; CTV wallet không lẫn điểm thưởng; endpoint F1 (che SĐT, lọc tháng); báo cáo admin; Cài đặt 3 tỷ lệ.
- e2e (Playwright): khách có điểm bật "Dùng điểm" → tổng tiền giảm, đơn hiển thị dòng điểm; trang Bạn bè đã giới thiệu; trang admin Giới thiệu.

## Ngoài phạm vi

Đổi điểm lấy voucher; rút điểm thưởng; F2+; hết hạn điểm; cộng hồi tố; hoa hồng cho tài xế giới thiệu khách.

## Việc kèm theo

- Cập nhật `docs/specs/affiliate-policy.md` (đã lỗi thời) theo spec này.
- Sửa bất nhất phát hiện khi khảo sát: `TripCompletedDriverNotification` tính phí trên `price` thay vì `price − discount`.
