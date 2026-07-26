# Thiết kế: E2E Test cho Referral & Collaborator

**Ngày:** 2026-07-25
**Phạm vi:** Bộ test e2e tự động (Playwright) cho tính năng Giới thiệu (Referral) và Cộng tác viên/Thu hộ (Collaborator), chạy trên môi trường Docker local.

---

## 1. Mục tiêu

Viết test case rồi tự động hóa bằng `@playwright/test` để bảo vệ 2 tính năng "affiliate" hiện có khỏi regression: Referral (Tài xế→Tài xế, Khách→Khách) và Collaborator (thu hộ). Đồng thời cài Playwright MCP server để hỗ trợ khám phá/debug UI trong lúc viết test.

Referral vốn cần đi qua toàn bộ luồng đăng nhập → đặt xe → nhận chuyến → hoàn thành, nên các test case Referral tình cờ phủ luôn happy-path core của hệ thống — không cần viết test case core riêng trong phạm vi lần này.

---

## 2. Test Case List

### Nhóm 1 — Referral Tài xế → Tài xế

| # | Test case | Kỳ vọng |
|---|---|---|
| TC1.1 | Tài xế A (referrer, seed sẵn `0912345678`, đã active) lấy link giới thiệu ở Profile. Tài xế B đăng ký mới qua link (`?ref=...`) | B tạo thành công, `referred_by_user_id` gán về A (verify gián tiếp qua TC1.3) |

> ⚠️ **Nhóm 1 cần sửa tính năng trước.** `referred_by_user_id` hiện chỉ được set ở `AuthController::register()` (đăng ký khách hàng); `registerDriver()` không nhận `referral_code`, và `DriverRegisterPage.tsx` không đọc `?ref=`. Vì vậy `ReferralService::processDriverReferral()` luôn return sớm ở guard `referred_by_user_id === null` — referral tài xế→tài xế là dead code. Plan triển khai nối dây phần này (backend + frontend, kèm test PHPUnit) trước khi viết e2e cho Nhóm 1.
| TC1.2 | Admin duyệt tài xế B, nhưng B **chưa** hoàn thành chuyến nào | Ví A và B không đổi — chưa phát thưởng |
| TC1.3 | Admin nạp điểm cho B (cần điểm để trả phí app khi nhận cuốc), một khách đặt xe, B nhận chuyến, cập nhật trạng thái tới `completed` (chuyến đầu tiên của B) | Cả A và B đều **+100 điểm** trong ví (≈100.000đ; verify ở trang Ví của A và B) |
| TC1.4 | B nhận & hoàn thành chuyến thứ 2 | Không phát thêm điểm referral (chỉ tăng điểm từ chuyến bình thường) |

### Nhóm 2 — Referral Khách → Khách

| # | Test case | Kỳ vọng |
|---|---|---|
| TC2.1 | Khách C (referrer, seed sẵn `0901234567`) lấy link giới thiệu ở Profile. Khách D đăng ký mới qua link | D tạo thành công, `referred_by_user_id` gán về C |
| TC2.2 | D đặt chuyến đầu tiên nhưng chưa hoàn thành (đang `finding_driver`) | Chưa phát voucher |
| TC2.3 | Một tài xế nhận & hoàn thành chuyến của D (chuyến đầu tiên của D) | C nhận 2 voucher 50k, D nhận 4 voucher 50k (verify qua VoucherSheet hoặc trang voucher cá nhân khi D đặt chuyến kế tiếp) |
| TC2.4 | D đặt & hoàn thành chuyến thứ 2 | Không phát thêm voucher |

### Nhóm 3 — Collaborator (Thu hộ)

| # | Test case | Kỳ vọng |
|---|---|---|
| TC3.1 | Admin bật `is_collaborator` cho khách E (mới tạo) ở trang Customers | E trở thành collaborator |
| TC3.2 | Khách thường F (không phải collaborator) mở form đặt xe | Không thấy field Thu Hộ, hoặc bị chặn nếu cố gửi `collection_fee > 0` |
| TC3.3 | Khách E đặt chuyến kèm `collection_fee > 0`, tài xế nhận & hoàn thành | Tài xế nhận đúng số tiền thực nhận (đã trừ thu hộ, hiển thị đúng trên UI tài xế); ví CTV của E được cộng đúng 80% thu hộ (trang Ví CTV) |

---

## 3. Môi trường & Data Strategy

- **Môi trường:** Docker Compose local (`make up`). Chạy `make fresh` (migrate:fresh --seed) trước khi chạy suite để có dữ liệu sạch, xác định trước.
  - ⚠️ **Cảnh báo:** `make fresh` xóa sạch DB local hiện tại. Chỉ chạy trong môi trường dev sẵn sàng mất dữ liệu.
- **Đăng nhập:** thực tế là **mật khẩu**, không phải OTP — `useAuthLogin` đi qua phone → password. OTP chỉ dùng khi *đăng ký* và *quên mật khẩu*. Cả hai đều dùng `000000`: user seed có password `000000`, và `consumeOtp()` bypass khi `app()->environment('local')` hoặc mã là `000000`. Trên local `send()` cũng không gọi ZNS thật (chỉ log) — không tốn chi phí SMS.
- **Tận dụng seed sẵn có** (3 user cố định từ `make fresh`): khách `0901234567` làm referrer C (Nhóm 2), tài xế `0912345678` (đã active) làm referrer A (Nhóm 1), admin `0923456789` cho các bước duyệt/toggle collaborator. Không cần tạo mới các actor "referrer" này.
- **Data isolation trong 1 lần chạy:** Các user **mới** phải tạo trong test (driver B, khách D, khách E, khách F) dùng SĐT sinh ngẫu nhiên với prefix nhận diện được `0999xxxxxx` (6 số cuối random), tránh đụng nhau giữa các test case chạy chung 1 DB đã seed.

---

## 4. Kiến trúc Suite

**Cách tiếp cận:** E2E UI thuần túy — mọi bước (đăng nhập, duyệt tài xế, đặt xe, nhận chuyến, toggle collaborator...) đều thao tác qua UI thật, không tạo dữ liệu setup qua gọi API trực tiếp. Mỗi test case nhiều actor mở nhiều `browser.newContext()` trỏ tới baseURL tương ứng vai trò, trong cùng 1 spec file.

```
frontend/
├── playwright.config.ts        # 1 project Chromium, testDir './e2e'
│                                # fullyParallel: false + workers: 1 — các spec dùng chung
│                                # actor seed cố định và chung pool chuyến "finding_driver"
└── e2e/
    ├── fixtures/
    │   ├── testData.ts         # randomPhone() (0999xxxxxx), URL 3 app, tài khoản seed, giá/địa chỉ cố định
    │   ├── goong.ts            # stubGoong() — chặn rsapi.goong.io, trả địa chỉ + khoảng cách cố định
    │   ├── auth.ts             # loginExisting(), registerCustomer(), registerDriver(), đọc mã giới thiệu
    │   └── flows.ts            # createBooking(), driverAcceptTrip/CompleteTrip(), các thao tác admin, đọc ví
    ├── smoke.spec.ts           # kiểm tra scaffold chạy được
    ├── referral-driver.spec.ts # Nhóm 1 (TC1.1–1.4)
    ├── referral-customer.spec.ts # Nhóm 2 (TC2.1–2.4)
    └── collaborator.spec.ts    # Nhóm 3 (TC3.1–3.3)
```

- `@playwright/test` là devDependency của `frontend/`; config đặt ở gốc `frontend/` theo quy ước, `testDir` trỏ vào `e2e/`.
- Không dùng `baseURL`: mỗi actor `goto()` URL tuyệt đối của app tương ứng (`localhost:5173` khách, `:5174` tài xế, `:5175` admin) vì một test dùng nhiều app cùng lúc.
- **Stub Goong Maps:** form đặt xe không submit được nếu chưa có toạ độ (`distance_km` ≥ 0.1 chỉ set sau khi chọn gợi ý autocomplete). `stubGoong()` chặn `rsapi.goong.io` và trả dữ liệu cố định — UI vẫn chạy đủ (gõ → dropdown → click → tự tính giá) nhưng giá/khoảng cách xác định được nên assert số điểm ví chính xác, không phụ thuộc mạng, không tốn quota API.
- Polling/reload hợp lý khi chờ trạng thái thay đổi giữa actor (VD: khách đặt xe → tài xế thấy trong danh sách `finding_driver`), tránh hardcode `waitForTimeout`.

---

## 5. Playwright MCP

Thêm Playwright MCP server vào `.mcp.json` ở root project để Claude có thể tự điều khiển trình duyệt tương tác khi cần khám phá UI/debug thủ công trong lúc viết test (VD: xác nhận selector, xem lỗi UI trực quan). Đây là công cụ hỗ trợ tác giả test, **không phải** nơi lưu test case tự động — bộ test thật nằm ở `frontend/e2e/` như Section 4.

---

## 6. Rủi ro

- **`make fresh` xóa sạch DB local hiện tại** — cần chạy trong môi trường dev sẵn sàng mất dữ liệu, hoặc container test riêng.
- **Chạy song song nhiều spec dùng chung driver/admin seed cố định dễ race** (VD: driver A referrer vô tình thấy/nhận nhầm booking dành cho test khác) — giảm thiểu bằng `fullyParallel: false` cho 3 spec chính.
- **Race giữa actor trong cùng 1 test** (đặt xe → tài xế thấy trong danh sách) — cần polling hợp lý, không hardcode timeout.

---

## 7. Out of scope

- Regression toàn bộ các trang còn lại (Price Config, Static Pages CMS, ZNS/OTP provider switching, SSE realtime, Booking cancel/penalty, Vehicle capacity matching...) — để dành cho spec sau.
- CI integration (chạy suite tự động trên mỗi PR).
- Chạy trên staging — loại bỏ khỏi phạm vi vì OTP thật (ZNS/Zalo) tốn chi phí mỗi lần gửi; nếu cần test trên staging sau này, phải thiết kế lại chiến lược lấy OTP (đọc DB qua SSH hoặc whitelist bypass) như đã cân nhắc và loại bỏ trong quá trình brainstorm.
