# Green Car Airport — UI Design Specification for Mockup

> **Tool:** Google Stitch  
> **Goal:** Generate high-fidelity mobile mockups for customer demo  
> **Platform:** Progressive Web App (PWA), mobile-first  
> **Target devices:** iPhone 14 Pro / Android (390×844px viewport)

---

## 1. Brand & Visual Identity

### Brand Personality
Professional, trustworthy, eco-friendly, efficient. Inspired by premium ride-hailing apps but tailored for Vietnamese airport transfer context.

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| Primary Green | `#1B8A4C` | CTA buttons, active states, brand accents |
| Light Green | `#E8F5EE` | Card backgrounds, success states |
| Dark Navy | `#0F1F2E` | Headers, primary text |
| Warm White | `#F8FAF9` | App background |
| Neutral Gray | `#6B7280` | Secondary text, labels |
| Border Gray | `#E5E7EB` | Dividers, input borders |
| Alert Orange | `#F59E0B` | Pending status badges |
| Success Green | `#10B981` | Completed status badges |
| Danger Red | `#EF4444` | Cancel, block, error states |
| Gold | `#D4AF37` | Point/credits display |

### Typography
- **Font:** Inter (Google Fonts)
- **H1:** 24px, Bold, Dark Navy
- **H2:** 18px, SemiBold, Dark Navy  
- **Body:** 14px, Regular, Dark Navy
- **Caption:** 12px, Regular, Neutral Gray
- **CTA Button Text:** 16px, SemiBold, White

### Design Principles
- Rounded corners: 12px (cards), 8px (inputs), 999px (pills/badges)
- Card shadow: `0 2px 8px rgba(0,0,0,0.08)`
- Bottom navigation bar (5 tabs max)
- Large touch targets: minimum 48×48px
- Status bar: dark content on light background

---

## 2. Screen Inventory

Generate mockups for **3 user roles** across **15 key screens**:

---

## 3. ROLE A — Khách Hàng (Customer)

### Screen A1: Splash / Onboarding

**Layout:** Full-screen with centered brand mark  
**Elements:**
- Green Car Airport logo (car icon + leaf accent) centered at 40% from top
- App tagline: *"Đặt xe sân bay — Nhanh, minh bạch, tiện lợi"*
- Illustration: minimal airport terminal silhouette with a green car
- Bottom: two buttons stacked — **"Đăng nhập"** (filled green) and **"Đăng ký"** (outlined green)
- Footer text: *"Dành cho khách hàng · Dành cho tài xế"* as a text toggle link

---

### Screen A2: Đăng Nhập / OTP

**Layout:** Single-column form, top 30% is green gradient header  
**Elements:**
- Back arrow top-left
- Header: "Xác minh số điện thoại"
- Subtext: "Nhập số điện thoại để nhận mã OTP"
- Phone input field with `+84` prefix flag selector
- Large primary button: **"Gửi mã OTP"**
- **OTP Step (2nd state):** 6-digit OTP input boxes (each box 48×56px, auto-advance on type)
- Countdown timer: *"Gửi lại mã sau 0:45"* in gray
- Auto-verify animation on correct code entry

---

### Screen A3: Đặt Xe (Booking Form) ⭐ HERO SCREEN

**Layout:** Single-scroll form with sticky header  
**Elements:**

**Top Section — Trip Info Card:**
- White card with green left border
- Row 1: 📍 Điểm đón — text input with placeholder *"Nhập địa điểm đón"*
- Divider line with swap icon (↕) between rows
- Row 2: 🛫 Điểm đến — text input with placeholder *"Sân bay Tân Sơn Nhất"*

**Middle Section — Trip Details:**
- Date/time picker row: calendar icon + date chip + clock icon + time chip (both tappable)
- Distance input: "Số km ước tính" with number input + unit label "km"
- Suggested price section:
  - Label: *"Bảng giá tham khảo"*
  - Price range chip: `350,000 – 420,000 đ` in green pill
  - Your price input: large number input field, prefix "đ", hint text *"Nhập giá bạn muốn trả"*

**Voucher Row:**
- Ticket icon + "Thêm voucher" + arrow right (tappable row)
- If voucher applied: green pill showing discount amount

**Bottom Fixed — Summary + CTA:**
- Sticky footer card (white, shadow up)
- Left: "Tổng thanh toán: **420,000 đ**" 
- Right: Green button **"Đặt xe ngay →"** (full-width on confirm state)

---

### Screen A4: Trạng Thái Đơn (Booking Status)

**Layout:** Status timeline screen  
**Elements:**
- Top: Booking ID chip + status badge ("Đang tìm tài xế" in orange)
- Progress stepper (horizontal or vertical):
  - ✅ Đã đặt xe
  - 🔄 Đang tìm tài xế ← current
  - ⬜ Tài xế đã nhận
  - ⬜ Hoàn thành
- Trip summary card: route, time, price
- Driver info card (appears after driver accepts):
  - Avatar circle + name + star rating
  - Car make, model, plate number
  - Phone icon button (call) + Chat icon button
- Cancel button (text link, visible only within 1 hour of booking): *"Huỷ chuyến (còn 45 phút)"*
- Bottom: **"Đặt xe mới"** button after completion

---

### Screen A5: Lịch Sử Đặt Xe (Booking History)

**Layout:** List view with filter tabs  
**Elements:**
- Search bar at top
- Filter tabs: "Tất cả · Hoàn thành · Đã huỷ" (pill tabs, green active state)
- Booking list cards:
  - Left: date column (day number large, month small)
  - Route: origin → destination with arrow
  - Price in bold green
  - Status badge (color-coded)
  - Tap to expand: show driver name, distance, booking ID

---

## 4. ROLE B — Tài Xế (Driver)

### Screen B1: Driver Dashboard / Cuốc Xe (Trip List) ⭐ HERO SCREEN

**Layout:** Feed-style list with sticky header controls  
**Elements:**

**Header Bar:**
- Left: Avatar + "Xin chào, Minh 👋"
- Right: Point balance chip — gold coin icon + **"1,240 điểm"**
- Below header: online/offline toggle switch with label *"Sẵn sàng nhận cuốc"*

**Filter Row:**
- Location chip: 📍 *"Bật định vị — Sắp xếp theo gần nhất"* → toggle
- Sort: dropdown "Gần nhất / Mới nhất"

**Trip Cards (repeating):**
```
┌─────────────────────────────────┐
│  🕐 14:30 · Hôm nay   [MỚI]   │
│  📍 Quận 7 → 🛫 TSN           │
│  ↔ 12 km · ⏱ ~25 phút        │
│  💰 380,000 đ  [Phí: 76,000đ] │
│          [NHẬN CUỐC]           │
└─────────────────────────────────┘
```
- Badge "MỚI" in green (trips < 30 min old)
- Fee deduction shown in smaller gray text
- **"NHẬN CUỐC"** — large green button, full card width
- If driver at max capacity (3 trips): button becomes disabled gray + tooltip "Hoàn thành cuốc hiện tại trước"

---

### Screen B2: Chi Tiết Cuốc (Trip Detail)

**Layout:** Full detail sheet (modal or new screen)  
**Elements:**
- Map preview card (static map image) showing pickup → dropoff pin
- Customer info row: avatar initial + masked phone number + call button
- Trip specs grid (2×2):
  - 📅 Ngày giờ
  - ↔ Khoảng cách  
  - 💰 Giá khách trả
  - 💸 Phí app (20%)
- Net earnings highlight: "**Bạn nhận: 304,000 đ**" in large green text
- Action buttons:
  - **"Nhận cuốc"** (green, primary)
  - "Bỏ qua" (text button, gray)
- After accepting: status update buttons — "Đang đến đón" → "Đang chạy" → "Hoàn thành"

---

### Screen B3: Ví Điểm & Nạp Điểm (Points Wallet)

**Layout:** Wallet-style screen  
**Elements:**

**Balance Card** (green gradient card):
- Label: "Số dư điểm"
- Large number: **1,240 điểm**
- Subtext: *"Tương đương 1,240,000 đ"*
- "Nạp điểm" button (white outlined)

**How-to-top-up instruction box** (light green):
- 💳 Chuyển tiền đến: **[Tên công ty]**
- 🏦 STK: `1234 5678 90` — Vietcombank
- ⚡ Điểm tự động cộng sau khi nhận tiền

**Transaction History:**
- List rows: icon (+ green for add, - red for deduct) + description + amount + date
- Examples:
  - ➕ Nạp điểm · +500 điểm · 12/06
  - ➖ Phí cuốc #1042 · -76 điểm · 12/06
  - ➕ Nạp điểm · +1,000 điểm · 10/06

---

### Screen B4: Hồ Sơ Tài Xế (Driver Profile)

**Layout:** Profile with verification status  
**Elements:**
- Avatar circle (large, 80px) with camera edit icon
- Name + phone number
- Verification badge: ✅ "Đã xác minh" or ⏳ "Chờ duyệt"
- Vehicle info card: make/model, plate, year, color
- Stats row: trips completed / rating / months active
- Settings rows: Đổi mật khẩu · Thông báo · Đăng xuất

---

## 5. ROLE C — Admin

### Screen C1: Admin Dashboard

**Layout:** Dark-mode optional; desktop-friendly but mobile-usable  
**Elements:**

**Summary KPI Cards (2×2 grid):**
- 🚗 Cuốc hôm nay: **47** (↑12% vs yesterday)
- 💰 Doanh thu: **18.2M đ**
- 👤 Tài xế online: **23 / 58**
- 🎫 Phí app thu: **3.6M đ**

**Recent Trips Table:**
- Columns: ID · Khách · Tài xế · Tuyến · Trạng thái · Thời gian
- Color-coded status pills

**Quick Actions Row:**
- [Duyệt tài xế mới] [Tạo voucher] [Xem báo cáo]

---

### Screen C2: Quản Lý Tài Xế (Driver Management)

**Layout:** List + search + filter  
**Elements:**
- Search bar: "Tìm theo tên, SĐT, biển số"
- Filter tabs: "Tất cả · Đang hoạt động · Chờ duyệt · Đã block"
- Driver cards:
  - Avatar + name + phone
  - Point balance + trips count
  - Status badge
  - Actions: **"Xem"** · **"Block"** (red destructive)
- "Block" confirmation modal: red warning card, reason input, confirm button

---

### Screen C3: Tạo Voucher

**Layout:** Simple form  
**Elements:**
- Voucher code input (auto-generate button)
- Discount type toggle: "Số tiền cố định / Phần trăm"
- Discount value input
- Target: "Tất cả khách / Chọn khách cụ thể" — dropdown or search-select
- Expiry date picker
- Usage limit input
- **"Tạo Voucher"** green button
- Below: list of active vouchers with copy-code and deactivate options

---

### Screen C4: Báo Cáo Doanh Thu (Revenue Report)

**Layout:** Chart-forward analytics screen  
**Elements:**
- Period selector tabs: "Hôm nay · Tuần này · Tháng này · Tuỳ chọn"
- Bar chart: daily revenue (green bars) with app fee overlay (darker green)
- Summary stats below chart:
  - Tổng doanh thu: **54,800,000 đ**
  - Phí app thu được: **10,960,000 đ**
  - Số cuốc hoàn thành: **312**
  - Trung bình/cuốc: **175,600 đ**
- Export button: "📥 Xuất Excel"

---

## 6. Component Library

Generate these reusable components separately:

### 6.1 Bottom Navigation Bar (Customer)
4 tabs: 🏠 Trang chủ · 🚗 Đặt xe · 📋 Lịch sử · 👤 Hồ sơ  
Active tab: filled icon + label in Primary Green. Inactive: outline icon + gray label.

### 6.2 Bottom Navigation Bar (Driver)
4 tabs: 📋 Cuốc xe · 🗺 Bản đồ · 💰 Ví điểm · 👤 Hồ sơ

### 6.3 Status Badge Pills
```
[Đang tìm tài xế]  — Orange background, dark orange text
[Đã nhận]          — Blue background, dark blue text  
[Đang chạy]        — Green background, white text
[Hoàn thành]       — Gray background, dark gray text
[Đã huỷ]          — Red background, white text
[Chờ duyệt]        — Yellow background, dark text
[Đã block]         — Dark red background, white text
```

### 6.4 Trip Card (Driver view)
Full-width card, white background, 12px border-radius, subtle shadow, green left border accent (4px). Contains: time, route, distance, price, fee breakdown, CTA button.

### 6.5 Empty State
Centered illustration (simple line art of a car or document), heading text, subtext, optional CTA button. Use for: no trips, no history, no drivers.

### 6.6 Toast Notification
Bottom-center, pill shape (rounded full), dark navy background, white text, icon left. Variants: success (green icon), error (red icon), info (blue icon). Auto-dismiss 3s.

---

## 7. Key User Flows to Mockup as Sequences

### Flow 1: Customer Booking Flow (5 screens)
`Splash → Login/OTP → Booking Form → Booking Confirmation → Booking Status`

### Flow 2: Driver Trip Flow (4 screens)  
`Dashboard (trip list) → Trip Detail → Accept Confirmation → Active Trip Status`

### Flow 3: Driver Wallet (3 screens)
`Wallet Balance → Top-up Instructions → Transaction History`

### Flow 4: Admin Oversight (3 screens)
`Dashboard → Driver List → Block Confirmation Modal`

---

## 8. Mockup Output Instructions for Google Stitch

When generating mockups, please follow these instructions:

1. **Device frame:** iPhone 14 Pro (393×852pt) with status bar showing 9:41 AM
2. **Resolution:** @2x (Retina) for all assets
3. **Style:** Clean, modern mobile UI — reference apps: Grab, Be, Gojek for layout patterns
4. **Language:** All UI text in Vietnamese as specified above
5. **Illustrations:** Use simple, flat-style icons. Prefer Lucide or Material Icons style.
6. **Spacing system:** 4pt base grid (8, 12, 16, 20, 24, 32pt spacing)
7. **Prioritize these 5 screens first for customer demo:**
   - A3: Đặt Xe (Booking Form) — most important
   - B1: Driver Trip List — most important for driver UX
   - A4: Booking Status
   - C1: Admin Dashboard
   - B3: Driver Wallet

---

## 9. Sample Copy (Vietnamese UI Strings)

```
App name:        Green Car Airport
Tagline:         Đặt xe sân bay — Nhanh, minh bạch, tiện lợi
Login CTA:       Đăng nhập bằng SĐT
OTP label:       Nhập mã 6 chữ số được gửi đến 09xx xxx xxx
Book button:     Đặt xe ngay →
Accept trip:     Nhận cuốc này
Complete trip:   Hoàn thành chuyến
Points unit:     điểm
Currency format: 380,000 đ
Cancel warning:  Huỷ sau 1 giờ sẽ bị phạt 50,000 đ
Block confirm:   Tài khoản này sẽ bị khoá vĩnh viễn. Xác nhận?
No trips empty:  Chưa có cuốc xe nào. Hãy chờ khách đặt!
```

---

*Document prepared for Google Stitch mockup generation — Green Car Airport PWA*  
*AMD AI Solutions × Green Car Airport · Phase 1 MVP Demo*
