# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

*Green Car Airport* is a Vietnamese airport-transfer ride-hailing platform. The repository contains:
- **`backend/`** — Laravel 13 API (PHP 8.4, MySQL, Redis)
- **`stitch_pwa_t_xe_ti_n_chuy_n/`** — Google Stitch HTML mockups
- **`DESIGN.md`** — Master UI spec (source of truth for all screens)

## Repository Layout

```
green-car-airport/
├── backend/                           # Laravel 13 application
├── docker/
│   ├── nginx/conf.d/default.conf      # Nginx config
│   └── php/Dockerfile                 # PHP 8.4-FPM image
├── docker-compose.yml
├── Makefile                           # Dev shortcuts
├── DESIGN.md                          # Master UI spec
└── stitch_pwa_t_xe_ti_n_chuy_n/
    ├── t_xe_booking_form/             # Screen A3 — Customer booking form
    ├── tr_ng_th_i_n_booking_status/   # Screen A4 — Booking status
    ├── danh_s_ch_chuy_n_driver_dashboard/ # Screen B1 — Driver trip list
    ├── v_i_m_wallet/                  # Screen B3 — Driver wallet
    └── b_ng_i_u_khi_n_admin_dashboard/ # Screen C1 — Admin dashboard
```

## Docker Development Environment

All development runs inside Docker. PHP/Composer are not required on the host.

**Services and ports:**

| Container | Purpose | Host port |
|---|---|---|
| `green_car_app` | PHP 8.4-FPM | — |
| `green_car_nginx` | Web server | **8080** |
| `green_car_mysql` | MySQL 8.0 | 3306 |
| `green_car_redis` | Redis 7 | 6380 |
| `green_car_mailpit` | Mail catcher | 1025 (SMTP) / **8025** (UI) |

**Common commands (use Makefile or docker compose directly):**

```bash
make up               # start all containers
make down             # stop all containers
make build            # rebuild images from scratch
make shell            # bash into app container
make migrate          # php artisan migrate
make fresh            # migrate:fresh --seed
make test             # php artisan test
make lint             # ./vendor/bin/pint

# Pass arbitrary artisan/composer commands:
make artisan route:list
make composer require spatie/laravel-permission
```

**Running a single test:**
```bash
docker compose exec app php artisan test --filter=ExampleTest
docker compose exec app php artisan test tests/Feature/ExampleTest.php
```

## Backend Stack

- **Laravel 13.9** / **PHP 8.4**
- **MySQL 8.0** — primary database (`DB_HOST=mysql` inside containers)
- **Redis 7** — cache, session, queue (`REDIS_HOST=redis` inside containers)
- **Mailpit** — catches outbound mail locally (`MAIL_HOST=mailpit`)

The `backend/.env` is already configured for Docker. Copy it from `backend/.env.example` on a fresh clone, then run `php artisan key:generate` inside the container.

## Three User Roles

| Role | Vietnamese | Key Screens |
|---|---|---|
| Customer | Khách Hàng | Booking form (A3), Status (A4) |
| Driver | Tài Xế | Trip list (B1), Wallet (B3) |
| Admin | Admin | Dashboard (C1) |

## UI Mockups

Each module under `stitch_pwa_t_xe_ti_n_chuy_n/` contains `code.html` and `screen.png`. Open `code.html` directly in a browser (requires internet for Tailwind CDN + Google Fonts). All UI text is Vietnamese — do not translate.

**Design tokens (Tailwind color names used in every mockup):**

| Token | Hex | Use |
|---|---|---|
| `primary` | `#006a36` | Buttons, active states |
| `light-green` | `#E8F5EE` | Card backgrounds |
| `warm-white` | `#F8FAF9` | App background |
| `alert-orange` | `#F59E0B` | Pending status |
| `success-green` | `#10B981` | Completed status |
| `danger-red` | `#EF4444` | Cancel / error |
