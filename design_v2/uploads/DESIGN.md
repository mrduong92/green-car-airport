# Green Car Airport — UI Design Specification

> **Thiết kế:** Claude Design  
> **Platform:** Progressive Web App (PWA), mobile-first  
> **Target:** iPhone 14 Pro / Android (390×844px) — Admin cũng responsive trên PC

---

## 1. Brand & Visual Identity

### Brand Personality
Chuyên nghiệp, đáng tin cậy, hiện đại. Dịch vụ đưa đón sân bay cao cấp tại Việt Nam.

### Color Palette

> ⚠️ **Đang redesign** — màu xanh `#006a36` hiện tại quá gần với Grab. Bộ màu dưới đây là hiện trạng trong code; sẽ được thay thế sau khi có design mới từ Claude Design.

| Token | Hex | Tailwind class | Dùng cho |
|---|---|---|---|
| Primary | `#006a36` | `primary` | CTA, active nav, brand accent |
| Light Green | `#E8F5EE` | `light-green` | Card bg, success tint |
| Warm White | `#F8FAF9` | `warm-white` | App background |
| Navy | `#0F1F2E` | `navy` | Tiêu đề, text chính |
| Neutral Gray | `#6B7280` | `neutral-gray` | Text phụ, label |
| Border Gray | `#E5E7EB` | `border-gray` | Divider, input border |
| Alert Orange | `#F59E0B` | `alert-orange` | Trạng thái chờ |
| Success Green | `#10B981` | `success-green` | Trạng thái hoàn thành |
| Danger Red | `#EF4444` | `danger-red` | Huỷ, lỗi, block |
| Gold | `#D4AF37` | `gold` | Ví điểm |

### Typography
- **Font:** Inter (Google Fonts)
- **H1:** 24px Bold Navy — tiêu đề trang
- **H2:** 18px SemiBold Navy — tiêu đề section
- **Body:** 14px Regular Navy
- **Caption:** 12px Regular Neutral Gray
- **CTA Button:** 16px SemiBold White

### Design Tokens (Tailwind)
```
rounded-card   = 12px
rounded-input  = 8px
rounded-pill   = 9999px
shadow-card    = 0 2px 8px rgba(0,0,0,0.08)
shadow-card-up = 0 -2px 8px rgba(0,0,0,0.06)
min-h-touch    = 48px
```

---

## 2. App Shell

### 2.1 Header — AppHeader

Dùng chung cho cả 3 role. Luôn `sticky top-0 z-30`, có `safe-top` (notch).

```
┌──────────────────────────────────────────────┐
│  [←/🚗]        Green Car / Tên màn hình   [Quy định / 🚪]
└──────────────────────────────────────────────┘
```

| Vị trí | Root tab | Detail page |
|---|---|---|
| **Trái** | Icon `directions_car` (primary) | Nút back `arrow_back` |
| **Giữa** | "Green Car" (bold) | Tên trang (từ route) |
| **Phải — Customer/Driver** | Nút "Quy định" (icon info + text, primary) | Nút "Quy định" |
| **Phải — Admin** | Icon logout | Icon logout |

**Quy định bottom sheet:** tap "Quy định" mở sheet từ dưới lên, backdrop đen mờ, danh sách rules theo role.

### 2.2 Bottom Navigation

**Customer (4 tabs):**
```
[🚗 Đặt xe]  [📋 Lịch sử]  [🔔 Thông báo]  [👤 Hồ sơ]
```

**Driver (4 tabs):**
```
[📋 Cuốc xe]  [💰 Ví điểm]  [🔔 Thông báo]  [👤 Hồ sơ]
```

**Admin — Mobile (6 tabs, nhỏ):**
```
[Dashboard]  [Tài xế]  [Voucher]  [Doanh thu]  [Bảng giá]  [Khách hàng]
```

**Admin — PC (lg+): Sidebar cố định bên trái**
```
┌─────────────┐
│ 🚗 Green Car│  ← brand
│ Admin Portal│
├─────────────┤
│ Dashboard   │  ← active: bg trắng/10, border-l primary
│ Tài xế      │
│ Voucher     │
│ Doanh thu   │
│ Bảng giá    │
│ Khách hàng  │
├─────────────┤
│ 🚪 Đăng xuất│
└─────────────┘
```
Content area: `ml-64`, full width, không max-w.

---

## 3. Screen Inventory

### Shared — Auth

| ID | Màn hình | Route | Status |
|---|---|---|---|
| S1 | Splash | `/` | ✅ |
| S2 | Đăng nhập OTP | `/login` | ✅ |

### Role A — Khách Hàng

| ID | Màn hình | Route | Status | Ghi chú |
|---|---|---|---|---|
| A1 | Đặt xe | `/customer/booking` | ✅ | Goong autocomplete, chọn xe, date/time, giá, voucher |
| A2 | Trạng thái đơn | `/customer/booking/:id` | ✅ | Stepper, thông tin tài xế, huỷ chuyến |
| A3 | Lịch sử | `/customer/history` | ⚠️ | Fix: FE gọi `r.data.data`, BE trả plain array |
| A4 | Thông báo | `/customer/notifications` | ❌ | Placeholder — chờ push notification (Phase N2) |
| A5 | Hồ sơ | `/customer/profile` | ✅ | Tên, SĐT, đăng xuất |

### Role B — Tài Xế

| ID | Màn hình | Route | Status | Ghi chú |
|---|---|---|---|---|
| B1 | Danh sách cuốc | `/driver/trips` | ✅ | Toggle online/offline, GPS, sort gần nhất/mới nhất |
| B2 | Chi tiết cuốc | `/driver/trips/:id` | ⚠️ | Fix: BE chưa xử lý `picking_up` (422) |
| B3 | Ví điểm | `/driver/wallet` | ⚠️ | Fix: cần deduct 20% thay vì cộng |
| B4 | Thông báo | `/driver/notifications` | ❌ | Placeholder |
| B5 | Hồ sơ | `/driver/profile` | ⚠️ | Thiếu: form chỉnh sửa xe inline |
| B6 | Onboarding tài xế mới | `/driver/onboarding` | ❌ | Chưa làm |

### Role C — Admin

| ID | Màn hình | Route | Status | Ghi chú |
|---|---|---|---|---|
| C1 | Dashboard | `/admin/dashboard` | ⚠️ | Fix: BE trả all-time stats, FE cần today stats |
| C2 | Quản lý tài xế | `/admin/drivers` | ⚠️ | Fix: pagination, search, points, block reason |
| C3 | Voucher | `/admin/vouchers` | ✅ | CRUD đầy đủ |
| C4 | Doanh thu | `/admin/revenue` | ⚠️ | Fix: param/field name mismatch |
| C5 | Bảng giá | `/admin/prices` | ✅ | CRUD + seed data |
| C6 | Khách hàng | `/admin/customers` | ❌ | Placeholder — chưa implement |

---

## 4. Screens — Chi tiết thiết kế

### A1 · Đặt xe ⭐ HERO

**Header:** AppHeader "Đặt xe" + "Quy định" button  
**Sub-header:** Nút "Quy định" nhỏ align right (giữ từ trước)

**Form layout (single scroll):**

```
┌─────────────────────────────────┐
│ 📍 Điểm đón (autocomplete)      │
│ ─────────────────────────────── │
│ 🛫 Điểm đến (autocomplete)      │
└─────────────────────────────────┘

[4 chỗ]  [5 chỗ]  [7 chỗ]   ← loại xe

[Hôm nay] [T2] [T3] [T4] ...  ← date chips, scroll ngang

Row 1: 0h  0h30  1h  1h30 ...  ← time rows, scroll ngang
Row 2: 8h  8h30  9h  9h30 ...
Row 3: 16h 16h30 ...

Khoảng cách: [__ km]  (auto-fill từ Goong Matrix)

Bảng giá tham khảo: [350,000 – 420,000 đ]  (từ API price-configs)

Giá bạn muốn trả: [_________đ]

🎫 Voucher: [Nhập mã...]  [Áp dụng]
```

**Sticky footer:**
```
┌─────────────────────────────────┐
│ Tổng: 420,000 đ   [ĐẶT XE →]   │
└─────────────────────────────────┘
```

---

### A2 · Trạng thái đơn

**Header:** AppHeader "Trạng thái đơn" + back button

```
Đơn #123                [Badge: Đang tìm tài xế]

Stepper (vertical):
✅ Đã đặt xe
🔄 Đang tìm tài xế  ← current (spinning icon)
⬜ Tài xế đã nhận
⬜ Hoàn thành

Trip summary card: điểm đón → điểm đến · ngày giờ · giá

Driver card (sau khi nhận):
  [Avatar] Nguyễn Văn A  ⭐ 4.8
           Toyota Camry · 51G-12345
  [📞 Gọi]

[Huỷ chuyến (còn 45 phút)]   ← chỉ hiện trong 1h đầu
```

---

### B1 · Danh sách cuốc ⭐ HERO

**Header:** AppHeader "Cuốc xe"

**Control strip (dưới header):**
```
Sẵn sàng nhận cuốc              [Toggle on/off]
```

**Sort row:**
```
📍 Sắp xếp theo:    [Gần nhất ▾]
```

**Trip cards:**
```
┌── border-l-4 primary ──────────────┐
│  🕐 14:30 · 24/05          [MỚI]  │
│  📍 Quận 7                         │
│     → 🛫 Sân bay Nội Bài           │
│  ↔ 12 km · ~X km tới đón          │
│  💰 380,000 đ   Phí: 76,000đ      │
│          [NHẬN CUỐC]               │
└────────────────────────────────────┘
```

---

### B2 · Chi tiết cuốc

**Header:** AppHeader "Chi tiết cuốc" + back  
**Content:**
```
Cuốc #42                    [Badge: accepted]

[Map placeholder — Phase 2]

[Avatar K]  09xx xxx xxx           [📞]

Ngày giờ  · Khoảng cách
Giá KH trả · Phí app 20%

Bạn nhận: 304,000 đ  (large, primary)

[Đang đến đón →]   hoặc  [Đang chạy →]  hoặc  [Hoàn thành]
[Bỏ qua]
```

---

### B3 · Ví điểm

**Header:** AppHeader "Ví điểm"

```
┌─── green gradient ──────────────┐
│ Số dư điểm                      │
│ 1,240 điểm                      │
│ ≈ 1,240,000 đ                   │
│ [Nạp điểm]                      │
└─────────────────────────────────┘

Hướng dẫn nạp:
💳 Chuyển khoản đến Green Car Airport Co.
🏦 STK: 1234 5678 90 — Vietcombank
⚡ Điểm tự động cộng sau khi nhận tiền

Lịch sử giao dịch:
[+/-icon] Mô tả           +/-X điểm  · DD/MM
```

---

### C1 · Admin Dashboard

**PC:** Sidebar + content full width  
**Mobile:** AppHeader + bottom nav (6 tab nhỏ)

```
KPI Grid 2×2:
[🚗 Cuốc hôm nay: 47 ↑12%]  [💰 Doanh thu: 18.2M đ]
[👤 Tài xế online: 23/58]   [🎫 Phí app thu: 3.6M đ]

Quick actions: [Duyệt tài xế] [Tạo voucher] [Báo cáo]

Chuyến gần đây (table):
#ID · Khách → Tài xế · Tuyến · Status · Giờ
```

---

## 5. Component Library

### 5.1 Status Badge Pills

| Status | Background | Text |
|---|---|---|
| `pending` / `finding_driver` | Alert Orange / 15% | Alert Orange |
| `accepted` / `picking_up` / `in_progress` | Primary / 15% | Primary |
| `completed` | Success Green / 15% | Success Green |
| `cancelled` | Danger Red | White |
| `waiting_approval` | Alert Orange / 15% | Alert Orange |
| `active` | Primary / 15% | Primary |
| `blocked` | Danger Red | White |

### 5.2 Button Variants

| Variant | Style |
|---|---|
| Primary (default) | bg-primary, text-white, rounded-pill |
| Outline | border-primary, text-primary, bg-transparent |
| Ghost | text-primary, no border/bg |
| Danger | bg-danger-red, text-white |

Sizes: `sm` (px-3 py-1.5 text-sm) · `md` default · `lg` (py-4 text-base)

### 5.3 Input Fields

Border: `border-border-gray rounded-input`. Focus: `border-primary ring-1 ring-primary/20`. Error: `border-danger-red`.

### 5.4 Cards

`bg-white rounded-card shadow-card`. Driver trip cards thêm `border-l-4 border-primary`.

### 5.5 Empty State

Icon lớn (text-5xl, text-border-gray) + title (text-sm font-semibold navy) + subtitle (text-xs neutral-gray) + optional CTA button.

### 5.6 Toast

Fixed bottom-center, pill shape, max-w `[280px]`. Variants: `success` (primary icon), `error` (danger-red icon), `info` (neutral icon). Auto-dismiss 3s.

---

## 6. Quy định — Nội dung

### Quy định đặt xe (Khách hàng)

1. **schedule** — Đặt xe trước ít nhất 30 phút giờ khởi hành.
2. **cancel** — Hủy miễn phí trong vòng 1 giờ sau khi đặt.
3. **payments** — Hủy sau 1 giờ bị phạt 50.000đ, áp dụng cho chuyến tiếp theo.
4. **timer_off** — Chuyến tự động hủy sau 24 giờ nếu không có tài xế nhận.
5. **local_parking** — Giá đã bao gồm phí cầu đường và bãi đỗ sân bay.
6. **phone** — Tài xế sẽ chủ động liên hệ trước giờ đón để xác nhận.
7. **edit_off** — Không thể thay đổi điểm đón/đến sau khi đã đặt chuyến.

### Quy định tài xế

1. **account_balance_wallet** — Phí ứng dụng 20% được trừ từ ví điểm sau mỗi chuyến hoàn thành.
2. **paid** — Cần nạp điểm vào ví trước khi nhận cuốc (1.000đ = 1 điểm).
3. **checklist** — Tối đa 3 cuốc đang thực hiện cùng lúc.
4. **schedule** — Cập nhật trạng thái cuốc kịp thời — không để khách chờ.
5. **phone** — Chủ động liên hệ khách trước giờ đón để xác nhận.
6. **gpp_bad** — Tài khoản vi phạm nhiều lần có thể bị khoá bởi admin.

---

## 7. Key User Flows

### Flow 1: Khách đặt xe
`Splash → Login OTP → Đặt xe (form) → Trạng thái đơn → [Tài xế nhận] → Hoàn thành`

### Flow 2: Tài xế nhận cuốc
`Đăng nhập → Bật online + GPS → Danh sách cuốc → Chi tiết → Nhận → Đang đến → Đang chạy → Hoàn thành`

### Flow 3: Admin duyệt tài xế
`Dashboard → Danh sách tài xế → Xem hồ sơ → Duyệt / Block (với lý do)`

---

## 8. Phase 2 Roadmap

| Feature | Màn hình | Ghi chú |
|---|---|---|
| Push Notification | A4/B4 (Thông báo) | Web Push API + minishlink/web-push |
| Bản đồ tương tác | B7 (Driver Map) | Goong JS — driver marker + trip pins + bottom sheet |
| Onboarding tài xế | B6 | Form nhập xe, chờ duyệt |
| Quản lý khách | C6 | Danh sách, tìm kiếm, block, xem lịch sử |
| Penalty tự động | — | BE: check 1h → ghi penalty_amount |
| Auto-expiry | — | Job Laravel mỗi 5 phút → cancel booking 24h |

---

*Spec cập nhật: 2026-05-24 · Tool thiết kế: Claude Design*
