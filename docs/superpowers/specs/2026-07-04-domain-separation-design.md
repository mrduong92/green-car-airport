# Domain Separation — Auth & Customer/Driver Apps — Design Spec

**Date:** 2026-07-04
**Scope:** Tách frontend thành 2 app riêng (customer+admin / driver), deploy trên 2 subdomain khác nhau, để login luôn xác định đúng role — không còn phụ thuộc vào role-picker dùng chung.

---

## Vấn đề

Hiện tại `LoginPage.tsx` là 1 flow dùng chung cho cả 3 role (customer/driver/admin): `checkPhone` trả về danh sách role của 1 số điện thoại, nếu >1 role thì hiện bước "role-picker" để chọn. Từ khi cho phép 1 số điện thoại vừa là customer vừa là driver (commit `812610b`), flow này bắt đầu bộc lộ rủi ro nhầm role — logic role-picker dùng chung cho nhiều role khiến hành vi khó kiểm soát và dễ mặc định sai về customer.

## Mục tiêu

Tách frontend thành 2 app độc lập, build riêng, deploy trên 2 subdomain:
- `savego.com.vn` — customer + admin (admin qua route ẩn `/admin/login`)
- `driver.savego.com.vn` — driver

Mỗi app chỉ đăng nhập cho đúng 1 role mặc định (customer app → luôn `role=customer`; driver app → luôn `role=driver`), loại bỏ hoàn toàn bước role-picker. Việc tách theo entry point (không phải theo hostname sniffing trong 1 bundle) để sau này có thể tách driver thành native app hoặc repo riêng mà không phải gỡ rối code.

## Ngoài phạm vi

- Không đổi backend/API: các controller đã tách theo domain (`Customer/`, `Driver/`, `Admin/`) + role middleware; auth dùng Bearer token (không cookie/session) nên không phụ thuộc domain; CORS mặc định của Laravel (`allowed_origins: ['*']`, không có `config/cors.php` custom) đã cho phép gọi cross-origin — không cần sửa gì.
- Không tách admin ra subdomain riêng — admin vẫn nằm trong build customer.
- Không tách thành native app hay 2 repo riêng ở giai đoạn này.
- Không đụng tới các phần code dùng chung khác giữa customer/driver ngoài phạm vi auth (vd: `BookingController` liên quan collaborator/driver wallet) — ghi nhận nhưng không sửa trong spec này.
- Không thiết lập CI/CD pipeline build & deploy — spec chỉ mô tả cấu trúc build/Nginx, việc build 2 bundle trong CI là việc riêng.

---

## 1. Cấu trúc build frontend

2 entry point Vite dùng chung 1 codebase:

```
frontend/
├── index.html              # customer app (giữ nguyên)
├── driver.html              # MỚI — driver app entry HTML
├── vite.config.ts           # base config dùng chung (alias, plugin)
├── vite.customer.config.ts  # MỚI — extends base: input=index.html, port 5173, PWA manifest "Save Go"
├── vite.driver.config.ts    # MỚI — extends base: input=driver.html, port 5174, PWA manifest "Save Go Tài Xế"
└── src/
    ├── main.tsx              # customer entry (giữ nguyên, import router/customer.tsx)
    ├── main.driver.tsx        # MỚI — driver entry, import router/driver.tsx
    └── router/
        ├── customer.tsx       # MỚI — Splash, /login, /register, customer/*, admin/*, /admin/login
        ├── driver.tsx          # MỚI — /login, /register/driver, driver/*
        └── guards.tsx          # MỚI — RequireRole/GuestOnly/RequireDriverActive/RequireDriverPending dùng chung, import ở cả 2 router
```

`api/`, `components/common/`, `stores/`, `hooks/` giữ nguyên, dùng chung cho cả 2 app.

`components/driver/GoongTripMap.tsx` chuyển sang `components/common/GoongTripMap.tsx` — hiện `pages/customer/BookingStatusPage.tsx` đã import component này, để trong `driver/` là gắn nhãn sai domain.

`package.json` thêm scripts:
```json
"dev:customer": "vite --config vite.customer.config.ts",
"dev:driver":   "vite --config vite.driver.config.ts",
"build:customer": "vite build --config vite.customer.config.ts",
"build:driver":   "vite build --config vite.driver.config.ts",
```

Cả 2 dev server đều proxy `/api` sang container `nginx` như hiện tại (giữ `baseURL: '/api'` trong `api/axios.ts` không đổi) — không cần `VITE_API_URL` khác nhau giữa 2 app vì mỗi app luôn same-origin với backend qua Nginx proxy (dev) hoặc qua vhost riêng cũng proxy `/api/*` về cùng backend (prod).

---

## 2. Auth flow

`LoginPage.tsx` hiện thread `role` qua state, gán từ kết quả `checkPhone` (role đơn) hoặc từ bước role-picker (nhiều role). Bước role-picker bị loại bỏ hoàn toàn. Thay vào đó:

- **`pages/customer/LoginPage.tsx`** (chuyển từ `pages/LoginPage.tsx`) — giữ nguyên flow phone → password/OTP, nhưng `role` luôn hardcode `'customer'` khi gọi `checkPhoneApi`/`loginApi`/`resetPasswordApi`. Không còn nhánh role-picker.
- **`pages/driver/LoginPage.tsx`** (mới, dựa trên cùng flow) — giống hệt nhưng `role` hardcode `'driver'`. Khi `checkPhoneApi` báo số điện thoại không có role `driver` (chỉ có role `customer`), hiển thị "Số này chưa đăng ký tài xế" kèm CTA sang `/register/driver`, thay vì thông báo lỗi 422 "chưa đăng ký" chung chung như hiện tại.
- **`pages/admin/LoginPage.tsx`** (mới, tối giản) — cùng flow hardcode `role='admin'`, chỉ mount ở route `/admin/login` trong router customer, không có link nào trong UI trỏ tới.

3 page trên dùng chung ~90% state machine (phone/OTP/password step, countdown, mutations) qua 1 hook dùng chung `useAuthLogin(role: App.Role)` trả về state + mutation handlers; mỗi page tự render UI (heading, text, CTA) và xử lý lỗi theo role riêng — vd: driver page bắt lỗi "chưa đăng ký" từ `checkPhoneApi` để hiện CTA sang `/register/driver` thay vì toast lỗi chung. Tránh copy-paste 3 lần state machine giống nhau mà vẫn giữ mỗi page độc lập về UI/behavior.

Backend không đổi: `checkPhone`/`login`/`reset-password` đã nhận optional `role` filter — frontend giờ luôn gửi kèm thay vì đôi khi bỏ trống.

`DriverRegisterPage.tsx` và `pages/RegisterPage.tsx` (customer) giữ nguyên logic — đã độc lập, không dùng role-picker, chỉ cần chuyển vào đúng router (`driver.tsx` / `customer.tsx`).

---

## 3. Dev environment

`docker-compose.yml` thêm service thứ 2 cho driver app:

```yaml
  frontend_driver:
    image: node:22-alpine
    container_name: green_car_frontend_driver
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5174:5174"
    command: sh -c "npm install && npm run dev:driver"
    depends_on:
      - nginx
    networks:
      - app-network
```

`Makefile` thêm `logs-fe-driver` và `fe-shell-driver` (tương tự `logs-fe`/`fe-shell` hiện có, vẫn trỏ vào service customer). `make up` tự khởi động cả 2 service.

Local dev: `localhost:5173` = customer/admin app, `localhost:5174` = driver app. Không cần sửa `/etc/hosts` hay giả lập subdomain — app nào hiện ra do dev server nào được mở, không phải do hostname.

---

## 4. Production deployment

2 Nginx server block, cùng proxy `/api/*` về 1 backend Laravel (`app:9000`), chỉ khác `root`:

```nginx
server {
    server_name savego.com.vn;
    root /var/www/customer-dist;   # output của build:customer
    include common-spa-and-api.conf;
}

server {
    server_name driver.savego.com.vn;
    root /var/www/driver-dist;     # output của build:driver
    include common-spa-and-api.conf;
}
```

Các location block dùng chung (SPA fallback, proxy `/api/*`, PHP-FPM, 2 block SSE `driver/stream`/`customer/stream`) được tách vào 1 snippet `include` để 2 vhost không lệch nhau khi sửa. Việc build 2 bundle (`npm run build:customer`, `npm run build:driver`) và deploy mỗi `dist/` vào đúng root là việc của pipeline deploy — không thuộc phạm vi spec này.

---

## 5. Kiểm thử

Thủ công (không có business logic mới cần test tự động):
- Login trên `driver.savego.com.vn` (hoặc `localhost:5174`) với số điện thoại chỉ có role customer → hiện "chưa đăng ký tài xế" + CTA sang `/register/driver`.
- Cùng số đó, đăng ký thêm role driver → login trên driver domain thành công với `role=driver`, không hiện role-picker.
- Login trên `savego.com.vn` (`:5173`) với số điện thoại có cả 2 role → thành công với `role=customer`, không hiện role-picker.
- `/admin/login` (trong router customer) vẫn đăng nhập đúng tài khoản admin; không có link nào trỏ tới route này trong UI.
- `make up` khởi động cả `frontend` (5173) và `frontend_driver` (5174); cả 2 gọi được `/api` qua proxy.
- `npm run build:customer` và `npm run build:driver` đều build ra `dist/` hợp lệ, đúng tên/icon PWA theo từng app.
- Các tính năng customer/driver/admin hiện có (booking, trips, wallet...) không bị ảnh hưởng — kiểm tra nhanh 1 flow mỗi role.
