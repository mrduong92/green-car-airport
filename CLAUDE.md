# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

*Green Car Airport* is a Vietnamese airport-transfer ride-hailing platform with three user roles: **Khách Hàng** (Customer), **Tài Xế** (Driver), **Admin**.

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript + Tailwind CSS v3 + PWA |
| Backend | Laravel 13 / PHP 8.4 |
| Database | MySQL 8.0 |
| Cache / Queue | Redis 7 |
| Dev environment | Docker Compose |

## Repository Layout

```
green-car-airport/
├── frontend/                          # React PWA
│   └── src/
│       ├── api/           # Axios modules (auth, bookings, trips, admin)
│       ├── components/    # common/, customer/, driver/, admin/
│       ├── layouts/       # CustomerLayout, DriverLayout, AdminLayout
│       ├── pages/         # SplashPage, LoginPage, customer/, driver/, admin/
│       ├── router/        # customer.tsx + driver.tsx + guards.tsx (2 app targets)
│       ├── stores/        # Zustand: auth.ts, ui.ts
│       └── types.d.ts     # App.* namespace (shared domain types)
├── backend/                           # Laravel 13 API
├── docker/
│   ├── nginx/conf.d/default.conf
│   └── php/Dockerfile                 # PHP 8.4-FPM
├── docker-compose.yml
├── Makefile
└── DESIGN.md                          # Master UI spec (source of truth)
```

## Docker Services

| Container | Purpose | Host port |
|---|---|---|
| `green_car_frontend` | Vite dev server | **5173** |
| `green_car_frontend_driver` | Vite dev server (app tài xế) | **5174** |
| `green_car_nginx` | Laravel web server | **8080** |
| `green_car_app` | PHP 8.4-FPM | — |
| `green_car_mysql` | MySQL 8.0 | 3306 |
| `green_car_redis` | Redis 7 | 6380 |
| `green_car_mailpit` | Mail catcher | 1025 / **8025** (UI) |

## Common Commands

```bash
make up               # start all containers
make down             # stop all containers
make build            # rebuild images from scratch
make logs             # follow all logs
make logs-fe          # follow frontend logs only

# Backend
make shell            # bash into PHP container
make artisan route:list
make composer require spatie/laravel-permission
make migrate
make fresh            # migrate:fresh --seed
make test
make lint             # Laravel Pint

# Frontend
make fe-shell         # sh into frontend container
make fe-build         # production build
make logs-fe-driver   # follow driver frontend logs
make fe-shell-driver  # sh into driver frontend container

# Frontend builds (2 app targets)
docker compose exec frontend npm run build:customer   # → dist/
docker compose exec frontend npm run build:driver     # → dist-driver/
```

**Single test:**
```bash
docker compose exec app php artisan test --filter=ExampleTest
```

## Frontend Architecture

**State:** Zustand with `persist` middleware — `useAuthStore` (user, token, role), `useUiStore` (toast queue).

**Data fetching:** TanStack Query v5 — all API calls go through `src/api/` modules which use a shared Axios instance (`src/api/axios.ts`). The interceptor attaches `Bearer` token and redirects to `/login` on 401.

**Routing:** 2 app riêng, mỗi app 1 router + 1 Vite build target:
- `router/customer.tsx` (entry `main.tsx`, port 5173, `dist/`) — Splash, `/login`, `/register`, `/admin/login` (ẩn), `customer/*`, `admin/*`
- `router/driver.tsx` (entry `main.driver.tsx`, port 5174, `dist-driver/`) — `/login`, `/register/driver`, `driver/*`
- `router/guards.tsx` — `RequireRole`, `RequireDriverActive`, `RequireDriverPending` dùng chung; mỗi router có `GuestOnly` riêng theo role của app

Login không còn role-picker: mỗi app hardcode `role` khi gọi `checkPhone`/`login` (hook `useAuthLogin(role)`). Production: `savego.com.vn` = customer+admin, `driver.savego.com.vn` = driver (xem `deploy/nginx/`).

**Forms:** React Hook Form + Zod validation. See `BookingFormPage` and `VouchersPage` for patterns.

**Charts:** Chart.js via `react-chartjs-2` — used in `RevenuePage`.

## Design Tokens (Tailwind)

Defined in `frontend/tailwind.config.ts`. Use these class names:

| Token | Hex | Use |
|---|---|---|
| `primary` | `#006a36` | CTA buttons, active nav, brand accents |
| `light-green` | `#E8F5EE` | Card backgrounds, success tints |
| `warm-white` | `#F8FAF9` | App background |
| `navy` | `#0F1F2E` | Headings, primary text |
| `neutral-gray` | `#6B7280` | Secondary text, labels |
| `border-gray` | `#E5E7EB` | Dividers, input borders |
| `alert-orange` | `#F59E0B` | Pending status |
| `success-green` | `#10B981` | Completed status |
| `danger-red` | `#EF4444` | Cancel / error / block |
| `gold` | `#D4AF37` | Points/credits display |

Custom utilities: `rounded-card` (12px), `rounded-input` (8px), `rounded-pill` (9999px), `shadow-card`, `shadow-card-up`, `min-h-touch` / `min-w-touch` (48px).

## Backend Architecture

**Laravel 13.9 / PHP 8.4 — API-only, no Blade views.**

### Auth
OTP-based, no passwords. `POST /api/auth/otp/send` stores a 6-digit code, `POST /api/auth/otp/verify` issues a Sanctum personal access token. **Dev bypass:** `APP_ENV=local` OR OTP=`000000` always authenticates — `firstOrCreate` the user and return a token without checking the OTP table.

### Role middleware
`EnsureRole` (registered as `role` alias in `bootstrap/app.php`) checks `$request->user()->role`. Three roles: `customer`, `driver`, `admin`. Route groups in `routes/api.php` are nested `auth:sanctum` → `role:X`.

### Controller layout
```
app/Http/Controllers/
├── Auth/        OtpController (send, verify), AuthController (me, logout)
├── Customer/    BookingController (index, store, show, cancel), VoucherController (apply)
├── Driver/      TripController (index, accept, updateStatus), WalletController (show, transactions),
│                ProfileController (show, update), StatusController (update)
└── Admin/       DashboardController, DriverController (index, block, approve),
                 AdminVoucherController (index, store, deactivate), RevenueController
```

No API Resource classes — controllers return plain arrays directly.

### Business rules
- **App fee = 20%** of `booking.price - booking.discount` (effective price after voucher); driver nets 80% of effective price converted to points (1 point = 1,000 VND). Example: price=500k, discount=50k → effective=450k → fee=90k, driver earns=360k.
- `TripController::index()` only returns bookings with `status=finding_driver`.
- `TripController::updateStatus()` to `completed` → creates `WalletTransaction` and increments `driver_profiles.trips_count`.
- `RevenueController` groups completed bookings by `DATE(created_at)` — must use `groupByRaw` to avoid MySQL `only_full_group_by` error.

### Migration order (FK dependencies)
`vouchers` → `bookings` → `wallet_transactions` (wallet_transactions.booking_id references bookings).

### Dev seed data
`make fresh` runs 5 seeders: 3 fixed-phone users (`0901234567` customer, `0912345678` driver, `0923456789` admin), driver profile (Toyota Camry 51G-12345), wallet (1,240 pts), 5 sample bookings, 2 vouchers (`AIRPORT50K`, `NEWUSER10`).

### Backend env
- `DB_HOST=mysql`, `REDIS_HOST=redis`, `MAIL_HOST=mailpit` inside containers
- `backend/.env` is pre-configured for Docker — copy from `.env.example` on fresh clone, then `make artisan key:generate`

## All UI Text is Vietnamese

Do not translate Vietnamese strings to English anywhere in the codebase.
