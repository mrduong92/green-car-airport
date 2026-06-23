# Save Go Rename + Referral Code Backfill Design

**Date:** 2026-06-23

## Summary

Two combined changes:
1. Rename the app from "Green Car Airport" → "Save Go" (domain: savego.com.vn)
2. Change all `GCA` code prefix → `SGO`, extract it to env config so future renames are one-line changes
3. Backfill `referral_code` for existing users (seed accounts have `NULL` because `booted()` only fires on `creating`)
4. Backfill/rename `payment_code` for existing driver profiles (`GCA000001` → `SGO000001`)

## Scope of Changes

### Backend config

| File | Change |
|---|---|
| `backend/.env` | `APP_NAME="Save Go"`, `MAIL_FROM_ADDRESS="noreply@savego.com.vn"`, `VAPID_SUBJECT=mailto:admin@savego.com.vn`, add `APP_CODE_PREFIX=SGO` |
| `backend/.env.example` | Same as above |
| `backend/config/app.php` | Add `'code_prefix' => env('APP_CODE_PREFIX', 'SGO')` |
| `backend/config/services.php` | VAPID_SUBJECT default → `mailto:admin@savego.com.vn` |

### Backend models & services

| File | Change |
|---|---|
| `backend/app/Models/User.php` | `'GCA-'` → `config('app.code_prefix') . '-'` in `booted()` |
| `backend/app/Models/DriverProfile.php` | `'GCA'` → `config('app.code_prefix')` in `booted()` |
| `backend/app/Http/Controllers/Driver/WalletController.php` | Fallback payment code `'GCA'` → `config('app.code_prefix')` |
| `backend/app/Services/SepayWebhookService.php` | Regex `GCA\d{6}` → built dynamically from `config('app.code_prefix')` |

### Existing tests to update

| File | Change |
|---|---|
| `backend/tests/Feature/UserReferralCodeTest.php` | `assertStringStartsWith('GCA-', ...)` → `'SGO-'` |
| `backend/tests/Feature/ReferralRegistrationTest.php` | `'GCA-ZZZZZZ'` (invalid code test) → `'SGO-ZZZZZZ'` |

### Data migrations

Two new migrations (no down method — data-only migrations are one-way):

**Migration 1 — `backfill_referral_codes_rename_prefix`**
- `UPDATE users SET referral_code = REPLACE(referral_code, 'GCA-', 'SGO-') WHERE referral_code LIKE 'GCA-%'`
- PHP loop: for each user where `referral_code IS NULL`, generate unique `SGO-XXXXXX`

**Migration 2 — `rename_payment_code_prefix`**
- `UPDATE driver_profiles SET payment_code = REPLACE(payment_code, 'GCA', 'SGO') WHERE payment_code LIKE 'GCA%'`

### Frontend config

| File | Change |
|---|---|
| `frontend/.env` | Add `VITE_CODE_PREFIX=SGO` |
| `frontend/.env.example` | Add `VITE_CODE_PREFIX=SGO` |
| `frontend/src/pages/admin/VouchersPage.tsx` | `genCode` function: `'GCA'` → `` `${import.meta.env.VITE_CODE_PREFIX}` `` |

### Frontend rename — user-facing text

| File | Location | Old | New |
|---|---|---|---|
| `frontend/index.html` | `<title>` | `Green Car Airport` | `Save Go` |
| `frontend/index.html` | `apple-mobile-web-app-title` | `GreenCar` | `SaveGo` |
| `frontend/vite.config.ts` | PWA `name` | `Green Car Airport` | `Save Go` |
| `frontend/vite.config.ts` | PWA `short_name` | `GreenCar` | `SaveGo` |
| `frontend/src/components/common/AppHeader.tsx` | header brand span | `Green Car Airport` | `Save Go` |
| `frontend/src/components/common/AppHeader.tsx` | fallback route title | `Green Car` | `Save Go` |
| `frontend/src/pages/InstallPage.tsx` | app card name | `Green Car Airport` | `Save Go` |
| `frontend/src/pages/driver/WalletPage.tsx` | top-up instructions | `Green Car Airport Co.` | `Save Go Co.` |
| `frontend/src/pages/driver/ProfilePage.tsx` | navigator.share title | `Green Car Airport` | `Save Go` |
| `frontend/src/pages/driver/ProfilePage.tsx` | navigator.share text | `...Green Car Airport và nhận 100.000 điểm!` | `...Save Go và nhận 100.000 điểm!` |
| `frontend/src/pages/customer/ProfilePage.tsx` | navigator.share title | `Green Car Airport` | `Save Go` |
| `frontend/src/pages/customer/ProfilePage.tsx` | navigator.share text | `...Green Car Airport và nhận voucher ngay!` | `...Save Go và nhận voucher ngay!` |
| `frontend/src/pages/customer/ProfilePage.tsx` | contact sheet email | `support@greencar.vn` | `support@savego.com.vn` |
| `frontend/src/pages/customer/ProfilePage.tsx` | contact sheet Zalo | `Zalo OA: Green Car` | `Zalo OA: Save Go` |

## What NOT to Change

- `DB_DATABASE=green_car_airport` — infrastructure, not user-facing
- Migration file names — historical record
- `SEPAY_BANK_ACCOUNT_HOLDER` — company legal name

## Referral Code Format

- Old: `GCA-ABCDEF` (10 chars)
- New: `SGO-ABCDEF` (10 chars — same length, format unchanged)
- Generation: prefix from `config('app.code_prefix')`, dash, 6 uppercase random alphanumeric, loop for uniqueness

## Payment Code Format

- Old: `GCA000001` (9 chars, zero-padded user_id)
- New: `SGO000001` (9 chars — same length)
