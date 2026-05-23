# Screen Inventory — Green Car Airport

Mục đích: thống kê toàn bộ màn hình theo 3 role, xác định màn nào đã có và màn nào cần design.

**Trạng thái:**
- ✅ Hoàn chỉnh — có thể dùng
- ⚠️ Có code nhưng lỗi / thiếu chức năng quan trọng
- ❌ Chưa làm — cần design + implement

---

## Tổng quan nhanh

| Role | Tổng màn hình | ✅ Xong | ⚠️ Có lỗi | ❌ Chưa làm |
|---|---|---|---|---|
| Shared (Auth) | 2 | 2 | 0 | 0 |
| Khách hàng | 5 | 3 | 1 | 1 |
| Tài xế | 6 | 2 | 2 | 2 |
| Admin | 6 | 1 | 4 | 1 |
| **Tổng** | **19** | **8** | **7** | **4** |

---

## Shared — Auth

### S1 · Splash / Giới thiệu
- **Route:** `/`
- **Status:** ✅
- **Chức năng:** Logo, tagline, nút "Đăng nhập"
- **File:** `SplashPage.tsx`

---

### S2 · Đăng nhập OTP
- **Route:** `/login`
- **Status:** ✅
- **Chức năng:** Nhập SĐT → nhận OTP → xác minh → redirect theo role
- **Dev bypass:** OTP `000000` luôn thành công
- **File:** `LoginPage.tsx`

---

## Role A — Khách Hàng

**Bottom nav hiện tại:** Đặt xe · Lịch sử *(2 tab)*
**Bottom nav theo design:** Đặt xe · Lịch sử · **Hồ sơ** *(3 tab — tab Hồ sơ chưa có)*

---

### A1 · Đặt xe
- **Route:** `/customer/booking`
- **Tab nav:** Đặt xe
- **Status:** ✅
- **Chức năng:**
  - Goong autocomplete địa chỉ (pickup + destination)
  - Chọn loại xe (Sedan 4 / SUV 5 / MPV 7)
  - Date chips 7 ngày + time grid 0h–23h30
  - Tính khoảng cách tự động (Goong Matrix)
  - Gợi ý giá từ bảng giá admin + auto-fill giá trung bình
  - Áp voucher giảm giá
  - Tạo booking với GPS coords
- **File:** `customer/BookingFormPage.tsx`
- **Còn thiếu:** Banner cảnh báo nếu khách đang có penalty 50k chưa trả

---

### A2 · Trạng thái đặt xe
- **Route:** `/customer/booking/:id`
- **Status:** ✅
- **Chức năng:**
  - Progress stepper trạng thái (đặt → tìm tài xế → đã nhận → hoàn thành)
  - Hiển thị thông tin tài xế khi đã nhận (tên, xe, biển số, rating)
  - Nút gọi điện tài xế
  - Nút huỷ chuyến (có trong 1 tiếng)
- **File:** `customer/BookingStatusPage.tsx`
- **Còn thiếu:** Hiển thị cảnh báo penalty 50k khi huỷ sau 1h

---

### A3 · Lịch sử đặt xe
- **Route:** `/customer/history`
- **Tab nav:** Lịch sử
- **Status:** ⚠️
- **Chức năng:** Filter tabs (Tất cả / Hoàn thành / Đã huỷ), danh sách booking, expand xem chi tiết
- **File:** `customer/BookingHistoryPage.tsx`
- **Lỗi:** FE gọi `r.data.data` nhưng BE trả plain array → **danh sách luôn rỗng**. Cần sửa BE paginate hoặc FE đổi cách đọc.

---

### A4 · Hồ sơ khách hàng ❌
- **Route:** `/customer/profile` *(chưa có)*
- **Tab nav:** Hồ sơ *(tab chưa có trong nav)*
- **Status:** ❌ Chưa làm
- **Cần design + implement:**
  - Tên, SĐT hiển thị
  - Nút đăng xuất
  - (Tuỳ chọn) Lịch sử điểm phạt

---

### A5 · Thông báo penalty *(modal/banner)* ❌
- **Status:** ❌ Chưa làm
- **Ghi chú:** Hiện ra khi khách huỷ sau 1h hoặc khi mở BookingFormPage nếu đang có nợ. Có thể làm dạng banner trên A1 hoặc confirm modal trên A2.

---

## Role B — Tài Xế

**Bottom nav hiện tại:** Cuốc xe · Ví điểm · Hồ sơ *(3 tab)*
**Bottom nav theo design:** Cuốc xe · **Bản đồ** · Ví điểm · Hồ sơ *(4 tab — tab Bản đồ là Phase 2)*

---

### B1 · Danh sách cuốc
- **Route:** `/driver/trips`
- **Tab nav:** Cuốc xe
- **Status:** ✅
- **Chức năng:**
  - Toggle online/offline + lấy GPS khi bật online
  - Danh sách cuốc available (poll 15s)
  - Sort mới nhất / gần nhất (Haversine)
  - Badge `~X km tới điểm đón`
  - Nút "NHẬN CUỐC" từng card
  - Hiển thị số điểm ví thực
- **File:** `driver/TripListPage.tsx`
- **Còn thiếu:** Push notification khi có cuốc mới, disable nút khi đã đủ 3 cuốc active

---

### B2 · Chi tiết & Thực hiện cuốc
- **Route:** `/driver/trips/:id`
- **Status:** ⚠️
- **Chức năng:** Xem chi tiết, thông tin khách, cập nhật trạng thái, tính phí/thực nhận
- **File:** `driver/TripDetailPage.tsx`
- **Lỗi:** BE chưa xử lý trạng thái `picking_up` → bấm "Đang đến đón" sẽ bị lỗi 422
- **Còn thiếu:** Placeholder bản đồ chỉ đường (Phase 2)

---

### B3 · Ví điểm
- **Route:** `/driver/wallet`
- **Tab nav:** Ví điểm
- **Status:** ⚠️
- **Chức năng:** Số dư điểm, lịch sử giao dịch, hướng dẫn nạp điểm (chuyển khoản)
- **File:** `driver/WalletPage.tsx`
- **Lỗi:** Logic điểm sai spec — đang **cộng** điểm sau cuốc, spec yêu cầu tài xế **nạp trước** rồi **trừ phí 20%** khi hoàn thành

---

### B4 · Hồ sơ tài xế
- **Route:** `/driver/profile`
- **Tab nav:** Hồ sơ
- **Status:** ⚠️
- **Chức năng:** Xem tên, xe, biển số, số cuốc, rating, trạng thái xác minh
- **File:** `driver/ProfilePage.tsx`
- **Còn thiếu:** Form chỉnh sửa thông tin xe (inline edit)

---

### B5 · Onboarding tài xế mới ❌
- **Route:** `/driver/onboarding` *(chưa có)*
- **Status:** ❌ Chưa làm
- **Khi nào hiện:** Sau khi đăng nhập lần đầu, nếu tài xế chưa có `driverProfile` → redirect đến đây thay vì TripListPage
- **Cần design + implement:**
  - Điền tên đầy đủ
  - Hãng xe / model / biển số / năm / màu xe
  - Nút "Gửi hồ sơ duyệt"
  - Màn chờ duyệt (status = pending)

---

### B6 · Bản đồ cuốc xe *(Phase 2)* ❌
- **Route:** `/driver/map` *(chưa có)*
- **Tab nav:** Bản đồ *(chưa có)*
- **Status:** ❌ Phase 2
- **Cần design + implement:**
  - Goong interactive map
  - Marker vị trí tài xế (xanh lá)
  - Pin từng cuốc available
  - Tap pin → bottom sheet: chi tiết + nút nhận cuốc
- **Spec:** `docs/specs/driver-location.md`

---

## Role C — Admin

**Bottom nav hiện tại:** Dashboard · Tài xế · Voucher · Doanh thu · Bảng giá *(5 tab)*

---

### C1 · Dashboard
- **Route:** `/admin/dashboard`
- **Tab nav:** Dashboard
- **Status:** ⚠️
- **Chức năng:** KPI hôm nay, danh sách cuốc gần đây, shortcut
- **File:** `admin/DashboardPage.tsx`
- **Lỗi:** BE trả stats tổng dồn (all-time). FE cần: `trips_today`, `revenue_today`, `drivers_online`, `app_fee_today`, `recent_trips[]` — tất cả đều sai field name.

---

### C2 · Quản lý tài xế
- **Route:** `/admin/drivers`
- **Tab nav:** Tài xế
- **Status:** ⚠️
- **Chức năng:** Danh sách tài xế, search, filter theo status, duyệt, block có lý do
- **File:** `admin/DriversPage.tsx`
- **Lỗi:**
  - FE gọi `r.data.data` nhưng BE trả plain array → **list rỗng**
  - BE không trả trường `points` → hiện "undefined điểm"
  - Search/filter by status không hoạt động (BE không xử lý params)
  - Lý do block gửi lên nhưng BE bỏ qua, không lưu DB
- **Còn thiếu:** Nút nạp điểm cho tài xế, unblock

---

### C3 · Quản lý voucher
- **Route:** `/admin/vouchers`
- **Tab nav:** Voucher
- **Status:** ✅
- **Chức năng:** Tạo voucher (code, loại, giá trị, hạn dùng, giới hạn lượt), xem danh sách, deactivate
- **File:** `admin/VouchersPage.tsx`

---

### C4 · Báo cáo doanh thu
- **Route:** `/admin/revenue`
- **Tab nav:** Doanh thu
- **Status:** ⚠️
- **Chức năng:** Biểu đồ doanh thu theo kỳ, KPI tổng hợp, nút xuất Excel
- **File:** `admin/RevenuePage.tsx`
- **Lỗi:** BE dùng param `?days=30` và trả `{rows, total, total_fee, total_trips}`. FE dùng `?period=today/week/month` và đọc `{total_revenue, app_fee, trips_completed, avg_per_trip, chart[{label}]}` — **hoàn toàn không khớp**, chart không hiển thị được.

---

### C5 · Bảng giá
- **Route:** `/admin/prices`
- **Tab nav:** Bảng giá
- **Status:** ✅
- **Chức năng:** CRUD bảng giá tham khảo (loại dịch vụ × loại xe × cách tính giá), ẩn/hiện
- **File:** `admin/PriceConfigPage.tsx`
- **Spec:** `docs/specs/price-configs.md`

---

### C6 · Quản lý khách hàng ❌
- **Route:** `/admin/customers` *(chưa có)*
- **Tab nav:** Khách hàng *(chưa có trong nav)*
- **Status:** ❌ Chưa làm
- **Cần design + implement:**
  - Danh sách khách hàng (tên, SĐT, số cuốc đã đặt)
  - Tìm kiếm theo tên / SĐT
  - Xem lịch sử đặt xe của từng khách
  - Block khách hàng (với lý do)
  - Xem penalty đang áp dụng

---

## Tóm tắt — Màn hình cần design

| Màn hình | Role | Ưu tiên | Ghi chú |
|---|---|---|---|
| **A4** · Hồ sơ khách hàng | Khách | Thấp | Tên, SĐT, đăng xuất |
| **B5** · Onboarding tài xế mới | Tài xế | **Cao** | Bắt buộc để tài xế mới dùng được app |
| **C6** · Quản lý khách hàng | Admin | Trung bình | Danh sách, search, block |
| **B6** · Bản đồ cuốc xe | Tài xế | Thấp (Phase 2) | Goong interactive map |

---

## Nav bar hiện tại vs đủ

| Role | Hiện tại | Nên có |
|---|---|---|
| Khách | Đặt xe · Lịch sử | Đặt xe · Lịch sử · **Hồ sơ** |
| Tài xế | Cuốc xe · Ví điểm · Hồ sơ | Cuốc xe · **Bản đồ** · Ví điểm · Hồ sơ *(Phase 2)* |
| Admin | Dashboard · Tài xế · Voucher · Doanh thu · Bảng giá | + **Khách hàng** |
