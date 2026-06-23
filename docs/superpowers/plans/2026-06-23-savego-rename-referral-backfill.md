# Save Go Rename + Referral Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename app from "Green Car Airport" → "Save Go", change all `GCA` code prefixes to `SGO` (backed by env config), and backfill `referral_code` / `payment_code` for existing seed users.

**Architecture:** Three layers — (1) backend config + model/service prefix extraction, (2) data migrations to fix existing DB rows, (3) frontend text rename + env-driven voucher prefix. Changes are independent enough to parallelize tasks 1–2 with task 5, but migrations (task 3) must follow task 2.

**Tech Stack:** Laravel 13 / PHP 8.4, React 19 + TypeScript + Vite, MySQL 8.0

## Global Constraints

- All UI text in Vietnamese — do not translate
- `DB_DATABASE=green_car_airport` — keep unchanged (infrastructure, not user-facing)
- Migration files have no `down()` — data backfill migrations are intentionally one-way
- `SEPAY_BANK_ACCOUNT_HOLDER` — do NOT change (company legal name)
- Referral code format: `SGO-XXXXXX` (10 chars, 6 uppercase alphanumeric)
- Payment code format: `SGO000001` (prefix + 6-digit zero-padded user_id)
- Run tests with: `docker compose exec app php artisan test --filter=<TestClass>`
- Run migrations with: `docker compose exec app php artisan migrate`

---

### Task 1: Backend config — add `APP_CODE_PREFIX` and rename app

**Files:**
- Modify: `backend/config/app.php` — add `code_prefix` key
- Modify: `backend/.env` — update APP_NAME, MAIL_FROM_ADDRESS, VAPID_SUBJECT, add APP_CODE_PREFIX
- Modify: `backend/.env.example` — same as .env
- Modify: `backend/config/services.php` — update VAPID_SUBJECT default

**Interfaces:**
- Produces: `config('app.code_prefix')` → `'SGO'` (string), used by Tasks 2 and 3

- [ ] **Step 1: Add `code_prefix` to `config/app.php`**

In `backend/config/app.php`, after the `'maintenance'` block (before the closing `]`), add:

```php
    'code_prefix' => env('APP_CODE_PREFIX', 'SGO'),
```

- [ ] **Step 2: Update `backend/.env`**

Replace these lines:
```
APP_NAME="Green Car Airport"
```
→
```
APP_NAME="Save Go"
```

Add after `APP_DEBUG=true`:
```
APP_CODE_PREFIX=SGO
```

Replace:
```
MAIL_FROM_ADDRESS="noreply@greencarairport.vn"
```
→
```
MAIL_FROM_ADDRESS="noreply@savego.com.vn"
```

Replace:
```
VAPID_SUBJECT=mailto:admin@greencar.vn
```
→
```
VAPID_SUBJECT=mailto:admin@savego.com.vn
```

- [ ] **Step 3: Update `backend/.env.example`**

Same substitutions as Step 2 (APP_NAME, APP_CODE_PREFIX, MAIL_FROM_ADDRESS, VAPID_SUBJECT).

- [ ] **Step 4: Update default in `backend/config/services.php`**

Find line:
```php
'subject'     => env('VAPID_SUBJECT', 'mailto:admin@greencar.vn'),
```
Change to:
```php
'subject'     => env('VAPID_SUBJECT', 'mailto:admin@savego.com.vn'),
```

- [ ] **Step 5: Verify config loads correctly**

```bash
docker compose exec app php artisan tinker --execute="echo config('app.name') . ' / ' . config('app.code_prefix');"
```

Expected output: `Save Go / SGO`

- [ ] **Step 6: Commit**

```bash
git add backend/config/app.php backend/config/services.php backend/.env backend/.env.example
git commit -m "chore: add APP_CODE_PREFIX config, rename app to Save Go"
```

---

### Task 2: Backend models & services — use `config('app.code_prefix')` instead of hardcoded `GCA`

**Files:**
- Modify: `backend/app/Models/User.php`
- Modify: `backend/app/Models/DriverProfile.php`
- Modify: `backend/app/Http/Controllers/Driver/WalletController.php`
- Modify: `backend/app/Services/SepayWebhookService.php`
- Modify: `backend/tests/Feature/UserReferralCodeTest.php`
- Modify: `backend/tests/Feature/ReferralRegistrationTest.php`

**Interfaces:**
- Consumes: `config('app.code_prefix')` from Task 1
- Produces: new users get `SGO-XXXXXX` referral codes; new driver profiles get `SGO000001` payment codes

- [ ] **Step 1: Update `UserReferralCodeTest.php` — change `GCA-` assertion to `SGO-`**

In `backend/tests/Feature/UserReferralCodeTest.php`, line 18, change:
```php
$this->assertStringStartsWith('GCA-', $user->referral_code);
```
→
```php
$this->assertStringStartsWith('SGO-', $user->referral_code);
```

- [ ] **Step 2: Update `ReferralRegistrationTest.php` — change invalid code from `GCA-ZZZZZZ` to `SGO-ZZZZZZ`**

In `backend/tests/Feature/ReferralRegistrationTest.php`, find:
```php
'referral_code' => 'GCA-ZZZZZZ',
```
Change to:
```php
'referral_code' => 'SGO-ZZZZZZ',
```

- [ ] **Step 3: Run tests to verify they FAIL** (we haven't changed the model yet)

```bash
docker compose exec app php artisan test --filter=UserReferralCodeTest
```

Expected: FAIL — `test_referral_code_auto_generated_on_create` fails because `User::booted()` still generates `GCA-` prefix.

- [ ] **Step 4: Update `User.php` — use `config('app.code_prefix')`**

In `backend/app/Models/User.php`, inside `booted()`, change:
```php
$code = 'GCA-' . strtoupper(Str::random(6));
```
→
```php
$code = config('app.code_prefix') . '-' . strtoupper(Str::random(6));
```

- [ ] **Step 5: Update `DriverProfile.php` — use `config('app.code_prefix')`**

In `backend/app/Models/DriverProfile.php`, inside `booted()`, change:
```php
$profile->payment_code = 'GCA' . str_pad((string) $profile->user_id, 6, '0', STR_PAD_LEFT);
```
→
```php
$profile->payment_code = config('app.code_prefix') . str_pad((string) $profile->user_id, 6, '0', STR_PAD_LEFT);
```

- [ ] **Step 6: Update `WalletController.php` topupInfo fallback**

In `backend/app/Http/Controllers/Driver/WalletController.php`, line 51, change:
```php
$code    = $profile?->payment_code ?? ('GCA' . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT));
```
→
```php
$code    = $profile?->payment_code ?? (config('app.code_prefix') . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT));
```

- [ ] **Step 7: Update `SepayWebhookService.php` — dynamic regex from config**

In `backend/app/Services/SepayWebhookService.php`, replace lines 34–38:
```php
        // Fallback: extract GCA\d{6} từ content nếu Sepay chưa gửi field code
        if ($code === '') {
            $content = (string) ($payload['content'] ?? '');
            if (preg_match('/GCA\d{6}/', $content, $m)) {
                $code = $m[0];
            }
        }
```
→
```php
        // Fallback: extract payment code từ content nếu Sepay chưa gửi field code
        if ($code === '') {
            $content = (string) ($payload['content'] ?? '');
            $prefix  = preg_quote(config('app.code_prefix'), '/');
            if (preg_match('/' . $prefix . '\d{6}/', $content, $m)) {
                $code = $m[0];
            }
        }
```

- [ ] **Step 8: Run all referral tests to verify they PASS**

```bash
docker compose exec app php artisan test --filter=UserReferralCodeTest
docker compose exec app php artisan test --filter=ReferralRegistrationTest
docker compose exec app php artisan test --filter=ReferralServiceTest
docker compose exec app php artisan test --filter=ReferralTriggerTest
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/app/Models/User.php backend/app/Models/DriverProfile.php \
        backend/app/Http/Controllers/Driver/WalletController.php \
        backend/app/Services/SepayWebhookService.php \
        backend/tests/Feature/UserReferralCodeTest.php \
        backend/tests/Feature/ReferralRegistrationTest.php
git commit -m "refactor: use config('app.code_prefix') instead of hardcoded GCA prefix"
```

---

### Task 3: Data migrations — backfill and rename existing codes in DB

**Files:**
- Create: `backend/database/migrations/2026_06_24_000001_backfill_referral_codes_rename_prefix.php`
- Create: `backend/database/migrations/2026_06_24_000002_rename_payment_code_prefix.php`

**Interfaces:**
- Consumes: `config('app.code_prefix')` from Task 1

- [ ] **Step 1: Create migration — backfill referral codes**

Create file `backend/database/migrations/2026_06_24_000001_backfill_referral_codes_rename_prefix.php`:

```php
<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $prefix = config('app.code_prefix');

        // Step 1: rename existing GCA- codes to SGO- (or current prefix)
        DB::table('users')
            ->whereNotNull('referral_code')
            ->where('referral_code', 'like', 'GCA-%')
            ->lazyById()
            ->each(function ($user) use ($prefix) {
                $newCode = $prefix . '-' . substr($user->referral_code, 4);
                DB::table('users')->where('id', $user->id)->update(['referral_code' => $newCode]);
            });

        // Step 2: generate codes for users with null referral_code
        DB::table('users')
            ->whereNull('referral_code')
            ->lazyById()
            ->each(function ($user) use ($prefix) {
                do {
                    $code = $prefix . '-' . strtoupper(Str::random(6));
                } while (DB::table('users')->where('referral_code', $code)->exists());

                DB::table('users')->where('id', $user->id)->update(['referral_code' => $code]);
            });
    }

    public function down(): void
    {
        // intentionally empty — data migration is one-way
    }
};
```

- [ ] **Step 2: Create migration — rename payment code prefix**

Create file `backend/database/migrations/2026_06_24_000002_rename_payment_code_prefix.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $prefix = config('app.code_prefix');

        DB::table('driver_profiles')
            ->where('payment_code', 'like', 'GCA%')
            ->lazyById()
            ->each(function ($profile) use ($prefix) {
                $newCode = $prefix . substr($profile->payment_code, 3);
                DB::table('driver_profiles')->where('id', $profile->id)->update(['payment_code' => $newCode]);
            });
    }

    public function down(): void
    {
        // intentionally empty — data migration is one-way
    }
};
```

- [ ] **Step 3: Run migrations**

```bash
docker compose exec app php artisan migrate
```

Expected output: two migrations applied successfully.

- [ ] **Step 4: Verify in the database**

```bash
docker compose exec app php artisan tinker --execute="
  echo 'Users with null referral_code: ' . \App\Models\User::whereNull('referral_code')->count() . PHP_EOL;
  echo 'Users with GCA- prefix: ' . \App\Models\User::where('referral_code', 'like', 'GCA-%')->count() . PHP_EOL;
  echo 'Sample codes: '; \App\Models\User::limit(3)->pluck('referral_code')->each(fn(\$c) => print \$c . PHP_EOL);
  echo 'Payment codes with GCA: ' . \App\Models\DriverProfile::where('payment_code', 'like', 'GCA%')->count() . PHP_EOL;
  echo 'Sample payment code: ' . \App\Models\DriverProfile::first()?->payment_code . PHP_EOL;
"
```

Expected:
- `Users with null referral_code: 0`
- `Users with GCA- prefix: 0`
- All sample codes start with `SGO-`
- `Payment codes with GCA: 0`
- Sample payment code starts with `SGO`

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_06_24_000001_backfill_referral_codes_rename_prefix.php \
        backend/database/migrations/2026_06_24_000002_rename_payment_code_prefix.php
git commit -m "feat: backfill referral codes and rename GCA→SGO prefix in DB"
```

---

### Task 4: Frontend config — add `VITE_CODE_PREFIX` and update VouchersPage

**Files:**
- Modify: `frontend/.env`
- Modify: `frontend/.env.example`
- Modify: `frontend/src/pages/admin/VouchersPage.tsx`

**Interfaces:**
- Produces: `import.meta.env.VITE_CODE_PREFIX` → `'SGO'` for admin voucher code generator

- [ ] **Step 1: Add `VITE_CODE_PREFIX` to `frontend/.env`**

Append to `frontend/.env`:
```
VITE_CODE_PREFIX=SGO
```

- [ ] **Step 2: Add `VITE_CODE_PREFIX` to `frontend/.env.example`**

Append to `frontend/.env.example`:
```
VITE_CODE_PREFIX=SGO
```

- [ ] **Step 3: Update `VouchersPage.tsx` genCode function**

In `frontend/src/pages/admin/VouchersPage.tsx`, line 48, change:
```ts
const genCode = () => setValue('code', `GCA${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
```
→
```ts
const genCode = () => setValue('code', `${import.meta.env.VITE_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
```

- [ ] **Step 4: Verify in browser**

Open the admin vouchers page (`http://localhost:5173/admin/vouchers`). Click "Tạo mới" to open the form, then click the "Tạo mã" / auto-generate button. Confirm the generated code starts with `SGO`.

- [ ] **Step 5: Commit**

```bash
git add frontend/.env frontend/.env.example frontend/src/pages/admin/VouchersPage.tsx
git commit -m "feat: add VITE_CODE_PREFIX env var, use in voucher code generator"
```

---

### Task 5: Frontend rename — all user-facing "Green Car Airport" → "Save Go"

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/components/common/AppHeader.tsx`
- Modify: `frontend/src/pages/InstallPage.tsx`
- Modify: `frontend/src/pages/driver/WalletPage.tsx`
- Modify: `frontend/src/pages/driver/ProfilePage.tsx`
- Modify: `frontend/src/pages/customer/ProfilePage.tsx`

No backend tests — verify visually in browser after all edits.

- [ ] **Step 1: Update `frontend/index.html`**

Change:
```html
<meta name="apple-mobile-web-app-title" content="GreenCar" />
```
→
```html
<meta name="apple-mobile-web-app-title" content="SaveGo" />
```

Change:
```html
<title>Green Car Airport</title>
```
→
```html
<title>Save Go</title>
```

- [ ] **Step 2: Update `frontend/vite.config.ts` PWA manifest**

Change:
```ts
name: 'Green Car Airport',
short_name: 'GreenCar',
```
→
```ts
name: 'Save Go',
short_name: 'SaveGo',
```

- [ ] **Step 3: Update `AppHeader.tsx` — two occurrences**

Change fallback route title (line ~46):
```ts
return { title: 'Green Car', isRoot: true }
```
→
```ts
return { title: 'Save Go', isRoot: true }
```

Change brand span in header (line ~115):
```tsx
<span className="text-navy font-semibold text-[15px] tracking-tight">Green Car Airport</span>
```
→
```tsx
<span className="text-navy font-semibold text-[15px] tracking-tight">Save Go</span>
```

- [ ] **Step 4: Update `InstallPage.tsx` — app card name (line ~101)**

Change:
```tsx
<p className="font-bold text-lg leading-tight">Green Car Airport</p>
```
→
```tsx
<p className="font-bold text-lg leading-tight">Save Go</p>
```

- [ ] **Step 5: Update `WalletPage.tsx` — top-up instructions text (line ~67)**

Change:
```tsx
{ icon: 'account_balance', text: 'Chuyển khoản đến Green Car Airport Co.' },
```
→
```tsx
{ icon: 'account_balance', text: 'Chuyển khoản đến Save Go Co.' },
```

- [ ] **Step 6: Update `driver/ProfilePage.tsx` — navigator.share title and text (lines ~209–212)**

Change:
```tsx
onClick={() => navigator.share({
  title: 'Green Car Airport',
  text: 'Tham gia Green Car Airport và nhận 100.000 điểm!',
```
→
```tsx
onClick={() => navigator.share({
  title: 'Save Go',
  text: 'Tham gia Save Go và nhận 100.000 điểm!',
```

- [ ] **Step 7: Update `customer/ProfilePage.tsx` — three locations**

**7a.** navigator.share (lines ~230–232):
```tsx
onClick={() => navigator.share({
  title: 'Green Car Airport',
  text: 'Tham gia Green Car Airport và nhận voucher ngay!',
```
→
```tsx
onClick={() => navigator.share({
  title: 'Save Go',
  text: 'Tham gia Save Go và nhận voucher ngay!',
```

**7b.** Contact sheet email (line ~270):
```tsx
{ icon: 'mail',         label: 'Email',            value: 'support@greencar.vn', sub: 'Phản hồi trong vòng 24 giờ' },
```
→
```tsx
{ icon: 'mail',         label: 'Email',            value: 'support@savego.com.vn', sub: 'Phản hồi trong vòng 24 giờ' },
```

**7c.** Contact sheet Zalo (line ~271):
```tsx
{ icon: 'chat_bubble',  label: 'Zalo',             value: 'Zalo OA: Green Car',  sub: 'Phản hồi nhanh trong giờ hành chính' },
```
→
```tsx
{ icon: 'chat_bubble',  label: 'Zalo',             value: 'Zalo OA: Save Go',    sub: 'Phản hồi nhanh trong giờ hành chính' },
```

- [ ] **Step 8: Verify visually in browser**

Check the following screens for "Green Car Airport" text — none should appear:
- Customer profile page → header title, referral share sheet, contact sheet
- Driver profile page → share sheet
- Driver wallet top-up instructions
- Install page app card
- Browser tab title (should read "Save Go")

- [ ] **Step 9: Commit**

```bash
git add frontend/index.html frontend/vite.config.ts \
        frontend/src/components/common/AppHeader.tsx \
        frontend/src/pages/InstallPage.tsx \
        frontend/src/pages/driver/WalletPage.tsx \
        frontend/src/pages/driver/ProfilePage.tsx \
        frontend/src/pages/customer/ProfilePage.tsx
git commit -m "feat: rename Green Car Airport → Save Go in all user-facing frontend text"
```
