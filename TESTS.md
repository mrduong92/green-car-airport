# TESTS.md — Trạng thái hoàn thành theo module kỹ thuật

> Đối chiếu với phạm vi trong `docs/Bao_gia_cap_nhat.md` (Phần A — chức năng ban đầu, Phần B — change request). Cập nhật lần cuối theo trạng thái code trên branch `main` (sau merge `feature/domain-separation`).
>
> Chú thích trạng thái: ✅ Xong · ⚠️ Một phần · ❌ Chưa có

---

## 1. Xác thực & Phân quyền (Auth)

**Trạng thái: ✅ Xong** — *Báo giá A: Xác thực người dùng (4.000.000đ)*

- [x] OTP SMS gửi/xác thực (`backend/app/Http/Controllers/Auth/OtpController.php`) — hỗ trợ nhiều nhà cung cấp ZNS (Zalo, Abenla, SouthTelecom)
- [x] Đăng ký khách hàng + mật khẩu (`AuthController::register`)
- [x] Đăng ký tài xế kèm giấy tờ pháp lý + duyệt admin (`AuthController::registerDriver`, `DriverRegisterTest.php`)
- [x] Đăng nhập theo role (customer/driver/admin), dev bypass OTP `000000`
- [x] Một số điện thoại đăng ký được cả customer + driver (`CustomerAlsoRegistersAsDriverTest.php`)
- [x] Đặt lại mật khẩu qua OTP
- [x] Middleware phân quyền `EnsureRole` (customer/driver/admin)

Test tự động: `RegisterTest.php`, `DriverRegisterTest.php`, `OtpSendTest.php`, `OtpZnsFieldsTest.php`, `CustomerAlsoRegistersAsDriverTest.php`, `Zalo/Abenla/SouthTelecomZnsServiceTest.php`, `ZnsProviderBindingTest.php`, `ZnsDlrTest.php`.

---

## 2. Domain Separation — Auth theo subdomain (customer/driver)

**Trạng thái: ✅ Xong** — *hạng mục kỹ thuật bổ sung, không nằm trong báo giá gốc — refactor để sửa bug đăng nhập nhầm role*

- [x] 2 build target Vite riêng (customer+admin / driver) — `frontend/vite.config.ts`
- [x] Router tách riêng `router/customer.tsx`, `router/driver.tsx`, `router/guards.tsx`
- [x] Login hardcode role theo app, bỏ role-picker (`hooks/useAuthLogin.ts`)
- [x] Admin login ẩn tại `/admin/login`
- [x] Docker service `frontend_driver` (port 5174) + Makefile targets
- [x] Nginx reference config 2-subdomain (`deploy/nginx/`)

Xem chi tiết: `docs/superpowers/specs/2026-07-04-domain-separation-design.md`, `docs/superpowers/plans/2026-07-04-domain-separation.md`.

---

## 3. Module Đặt xe (Booking)

**Trạng thái: ✅ Xong** — *Báo giá A: Module Đặt xe (5.000.000đ)*

- [x] Form đặt xe với gợi ý bảng giá theo loại xe (`pages/customer/BookingFormPage.tsx`)
- [x] Tạo, xem, huỷ booking (`Customer/BookingController.php`)
- [x] Áp voucher khi đặt xe, giới hạn giảm giá (`VoucherApplyCapTest.php`, `BookingDiscountCapTest.php`, `PersonalVoucherTest.php`)
- [x] Huỷ chuyến có phụ phí sau 1h (`BookingCancelPenaltyTest.php`, `BookingCancelReasonTest.php`)
- [x] Khách hàng huỷ chuyến đã được nhận (`CustomerCancelAcceptedBookingTest.php`)
- [x] Thu hộ (collection fee) tích hợp vào giá cuối (xem mục Cộng tác viên)

Test tự động: `VoucherApplyCapTest.php`, `BookingDiscountCapTest.php`, `PersonalVoucherTest.php`, `BookingCancelPenaltyTest.php`, `BookingCancelReasonTest.php`, `CustomerCancelAcceptedBookingTest.php`.

---

## 4. Module Tài xế (Driver)

**Trạng thái: ✅ Xong** — *Báo giá A: Module Tài xế (8.000.000đ)*

- [x] Danh sách cuốc tức thời qua SSE (`Driver/StreamController.php`, `SsePublisherTest.php`)
- [x] Sắp xếp cuốc gần nhất theo vị trí tài xế (haversine — `TripController.php:32`)
- [x] Nhận cuốc, cập nhật trạng thái (accepted → in_progress → completed)
- [x] Hoàn thành cuốc kèm phụ phí (`TripCompleteWithSurchargeTest.php`, `TripCompleteNoCreditTest.php`)
- [x] Giá cuối cùng đồng bộ giữa customer/driver (`TripFinalPriceTest.php`)
- [x] Trạng thái online/offline (`Driver/StatusController.php`)

Test tự động: `SsePublisherTest.php`, `TripCompleteWithSurchargeTest.php`, `TripCompleteNoCreditTest.php`, `TripFinalPriceTest.php`.

---

## 5. Hệ thống điểm & phí (Wallet, Fee, Payment)

**Trạng thái: ✅ Xong** — *Báo giá A: Hệ thống điểm & phí (10.000.000đ)*

- [x] Webhook ngân hàng tự động (Sepay) — `Webhooks/SepayWebhookController.php`
- [x] Phí app 20%, tài xế nhận 80% quy đổi điểm (1 điểm = 1.000đ)
- [x] Voucher — tạo, áp dụng, giới hạn giảm giá tối đa 10%
- [x] Phạt huỷ chuyến, timeout tự động hết hạn tìm tài xế 24h
- [x] Nạp điểm ví tài xế (`pages/driver/TopUpPage.tsx`, `Driver/WalletController.php`)
- [x] Lịch sử giao dịch ví

Test tự động: (xem các test ở mục 3 và 4 — logic tính phí nằm chung trong BookingController/TripController)

---

## 6. Push Notification

**Trạng thái: ✅ Xong — vượt phạm vi ban đầu** — *Báo giá A: Push Notification (2.000.000đ, ban đầu chỉ yêu cầu "cuốc mới đến tài xế")*

- [x] PWA Web Push qua kênh riêng (`app/Channels/WebPushChannel.php`)
- [x] 11+ loại thông báo đã triển khai (vượt scope gốc): `NewBookingAvailableNotification`, `BookingCreatedNotification`, `BookingAcceptedNotification`, `BookingExpiredNotification`, `TripAcceptedDriverNotification`, `TripStartedNotification`, `TripCompletedDriverNotification`, `BookingCompletedCustomerNotification`, `CustomerCancelledNotification`, `CustomerCancelledDriverNotification`, `DriverCancelledNotification`, `DriverTopUpCompletedNotification`
- [x] Trung tâm thông báo trong app (`NotificationController.php`, `pages/customer/NotificationsPage.tsx`, `pages/driver/NotificationsPage.tsx`)
- [x] Quản lý device token (`DeviceTokenController.php`)

---

## 7. Admin Dashboard & Báo cáo

**Trạng thái: ✅ Xong** — *Báo giá A: Admin Dashboard & Báo cáo (5.000.000đ)*

- [x] Dashboard tổng quan (`Admin/DashboardController.php`, `pages/admin/DashboardPage.tsx`)
- [x] Quản lý tài xế — duyệt/khoá, xem giấy tờ (`Admin/DriverController.php`, `AdminDriverDocumentsTest.php`)
- [x] Quản lý khách hàng (`Admin/CustomerController.php`)
- [x] Quản lý voucher (`Admin/AdminVoucherController.php`)
- [x] Báo cáo doanh thu theo ngày (`Admin/RevenueController.php`)
- [x] Cấu hình bảng giá (`Admin/PriceConfigController.php`)
- [x] Quản lý số dư/ví toàn hệ thống (`Admin/AdminWalletController.php`)
- [x] Quản lý cấu hình ZNS (`Admin/ZnsController.php`, `AdminZnsBalanceTest.php`)

Test tự động: `AdminDriverDocumentsTest.php`, `AdminZnsBalanceTest.php`.

---

## 8. PWA & Triển khai

**Trạng thái: ✅ Code xong — go-live thực tế cần xác nhận riêng** — *Báo giá A: PWA & Triển khai (3.000.000đ)*

- [x] Cấu hình PWA (manifest, service worker) — `vite-plugin-pwa`, `src/sw.ts`
- [x] Cài đặt ứng dụng trên máy khách (`hooks/usePwaInstall.ts`, `pages/InstallPage.tsx`)
- [ ] Trỏ domain + go-live production — **việc vận hành (ops), không kiểm tra được qua code**, cần xác nhận riêng với đội triển khai/AMD

---

## 9. Cộng tác viên — Thu hộ

**Trạng thái: ✅ Xong** — *Báo giá B: Cộng tác viên — Thu hộ (2.000.000đ)*

- [x] Vai trò cộng tác viên (`is_collaborator` trên `User`)
- [x] Nhập thu hộ khi đặt xe hộ khách (`collection_fee` trên `Booking`)
- [x] Đối soát hoa hồng: tài xế bị trừ 80% thu hộ, CTV được cộng 80% khi hoàn thành cuốc
- [x] Ví riêng cho cộng tác viên (`Customer/CollaboratorWalletController.php`, `pages/customer/CollaboratorWalletPage.tsx`)

Test tự động: `CollaboratorWalletTest.php`, `CollaboratorFeeTest.php`, `CollaboratorBookingTest.php`.

---

## 10. Affiliate (Giới thiệu)

**Trạng thái: ⚠️ Một phần** — *Báo giá B: Affiliate (2.000.000đ)*

- [x] Link giới thiệu riêng theo mã (`referral_code`), chia sẻ từ trang hồ sơ (`pages/customer/ProfilePage.tsx`, `pages/driver/ProfilePage.tsx`)
- [x] Theo dõi người được giới thiệu (`referred_by_user_id`)
- [x] Tính thưởng tự động: khách mới → voucher; tài xế giới thiệu → cộng điểm ví loại `referral`
- [x] Admin xem tổng hợp số liệu referral (`Admin/DashboardController.php:78-79`)
- [ ] **Chưa có** dashboard riêng cho người giới thiệu tự xem số liệu/hoa hồng của mình (hiện chỉ thấy gián tiếp qua lịch sử ví/voucher, không có màn hình tổng hợp riêng)

Test tự động: `ReferralTriggerTest.php`, `ReferralServiceTest.php`, `ReferralRegistrationTest.php`, `UserReferralCodeTest.php`.

---

## 11. Trang tĩnh + Admin CRUD

**Trạng thái: ❌ Chưa có** — *Báo giá B: Trang tĩnh + Admin CRUD (2.000.000đ)*

- [ ] Trang Điều khoản dịch vụ
- [ ] Trang Chính sách bảo mật
- [ ] Admin CRUD quản lý nội dung trang tĩnh

Đã kiểm tra toàn bộ `backend/app` và `frontend/src` — không có migration, model, controller, hay trang admin nào liên quan đến static page/CMS content. **Đây là hạng mục duy nhất trong toàn bộ báo giá chưa được bắt đầu.**

---

## 12. Nhóm chức năng Bản đồ

**Trạng thái: ✅ Xong** — *Báo giá B: Nhóm chức năng Bản đồ (6.000.000đ)*

- [x] Vị trí của tôi — geolocation (`components/common/AddressInput.tsx`, `pages/driver/TripListPage.tsx`)
- [x] Tính khoảng cách điểm đón - đến qua Goong Maps (`BookingFormPage.tsx`, `distance_km`)
- [x] Sắp xếp cuốc theo khoảng cách tài xế (haversine, `Driver/TripController.php`)
- [x] Hiển thị bản đồ lộ trình ở màn chi tiết cuốc (`components/common/GoongTripMap.tsx`, dùng chung cho customer + driver)

---

## Tổng kết

| # | Module | Trạng thái |
|---|---|---|
| 1 | Xác thực & Phân quyền | ✅ |
| 2 | Domain Separation (bổ sung) | ✅ |
| 3 | Module Đặt xe | ✅ |
| 4 | Module Tài xế | ✅ |
| 5 | Hệ thống điểm & phí | ✅ |
| 6 | Push Notification | ✅ (vượt scope) |
| 7 | Admin Dashboard & Báo cáo | ✅ |
| 8 | PWA & Triển khai | ✅ code / ⚠️ go-live cần xác nhận ops |
| 9 | Cộng tác viên — Thu hộ | ✅ |
| 10 | Affiliate | ⚠️ thiếu dashboard cá nhân |
| 11 | **Trang tĩnh + Admin CRUD** | ❌ **chưa làm** |
| 12 | Nhóm chức năng Bản đồ | ✅ |

**11/12 module đã hoàn thành theo phạm vi báo giá.** Hạng mục còn thiếu hoàn toàn: **Trang tĩnh + Admin CRUD**. Hạng mục thiếu một phần: **Affiliate** (chưa có dashboard cá nhân cho người giới thiệu).
