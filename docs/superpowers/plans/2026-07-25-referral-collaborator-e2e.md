# Referral & Collaborator E2E Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire referral codes through driver registration (currently broken), then build a Playwright e2e suite covering Referral (driver→driver, customer→customer) and Collaborator (thu hộ) flows against local Docker.

**Architecture:** Tasks 1–2 fix the driver-referral gap in backend + frontend with PHPUnit coverage. Task 3 scaffolds Playwright (config, fixtures, Goong stubs, `.mcp.json`). Tasks 4–6 add one spec file per feature group, each driving multiple `browser.newContext()` instances to play customer/driver/admin roles through real UI. Every spec runs against `make up` containers with a freshly seeded DB.

**Tech Stack:** `@playwright/test` (Chromium), React 19 + Vite (ports 5173 customer / 5174 driver / 5175 admin), Laravel 13 API via nginx on 8080, MySQL 8, Docker Compose.

## Global Constraints

- **All UI text is Vietnamese.** Never translate Vietnamese strings. All selectors match Vietnamese text verbatim.
- **No `data-testid` exists anywhere in `frontend/src`** (verified: `grep -rn "data-testid" frontend/src` → 0 matches). Do NOT add testids. Use `getByPlaceholder`, `getByRole('button', { name: ... })`, and Vietnamese text selectors.
- **Login is password-based, not OTP.** `useAuthLogin` (`frontend/src/hooks/useAuthLogin.ts`) does phone → password. OTP is only for registration and password reset. Seeded users' password is `000000` (`UserSeeder.php:38`).
- **OTP bypass:** `AuthController::consumeOtp()` (`backend/app/Http/Controllers/Auth/AuthController.php:250`) returns early when `app()->environment('local')` OR code is `000000`. Registration tests always type `000000`.
- **Point unit:** 1 point = 1,000 VND. Driver referral reward is **100 points** (`ReferralService::DRIVER_REWARD_POINTS = 100`), which displays as `100` in the wallet, not `100.000`.
- **Test phone prefix:** all users created by tests use `0999` + 6 random digits, via `randomPhone()`. Never hardcode a new phone.
- **Seeded fixtures (from `make fresh`):** customer `0901234567`, driver `0912345678` (driver_profile `status='active'`, wallet 1,240 points), admin `0923456789`. Pending drivers `0989012345`, `0909123456`. All password `000000`.
- **Post-login redirects** (`useAuthLogin.ts:46-48`): customer → `/customer/booking`, driver → `/driver/trips` (or `/driver/profile` if `needs_onboarding`), admin → `/dashboard`.
- **Node/TS:** `frontend/` uses TypeScript `~6.0.2`, ESLint flat config, `verbatimModuleSyntax: true`. Use `import type` for type-only imports in e2e files.
- **`frontend/.env` must set a non-empty `VITE_GOONG_API_KEY`.** `goongAutocomplete()` (`frontend/src/api/goong.ts`) short-circuits to `return []` when the key is falsy, *before* ever calling `fetch()` — so Playwright's `page.route` stub (Task 3) never has a request to intercept if the key is empty. The key's actual value doesn't matter since the stub answers every request; a fresh checkout has no `frontend/.env` at all (gitignored), so create one with a placeholder value and restart the `frontend`/`frontend_driver`/`frontend_admin` containers before running any spec that calls `createBooking()`.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/Http/Controllers/Auth/AuthController.php` | Modify `registerDriver()` to accept + persist `referral_code` |
| `backend/tests/Feature/DriverReferralRegistrationTest.php` | Create — PHPUnit coverage for the above |
| `frontend/src/api/auth.ts` | Modify `driverRegisterApi` signature to include `referral_code` |
| `frontend/src/pages/DriverRegisterPage.tsx` | Modify — read `?ref=`, persist to localStorage, show input, send on submit |
| `.mcp.json` | Create — Playwright MCP server registration |
| `frontend/playwright.config.ts` | Create — Chromium project, no baseURL (specs use absolute URLs per app) |
| `frontend/e2e/fixtures/testData.ts` | Create — `randomPhone()`, shared constants (seeded accounts, addresses, prices) |
| `frontend/e2e/fixtures/goong.ts` | Create — `stubGoong(page)` route interceptor for `rsapi.goong.io` |
| `frontend/e2e/fixtures/auth.ts` | Create — `loginExisting()`, `registerCustomer()`, `registerDriver()` UI helpers |
| `frontend/e2e/fixtures/flows.ts` | Create — `createBooking()`, `driverCompleteTrip()`, `adminApproveDriver()`, `adminTopupDriver()`, `readDriverWalletPoints()` |
| `frontend/e2e/referral-driver.spec.ts` | Create — TC1.1–1.4 |
| `frontend/e2e/referral-customer.spec.ts` | Create — TC2.1–2.4 |
| `frontend/e2e/collaborator.spec.ts` | Create — TC3.1–3.3 |

---

## Task 1: Backend — `registerDriver` accepts `referral_code`

**Files:**
- Modify: `backend/app/Http/Controllers/Auth/AuthController.php:136-166`
- Test: `backend/tests/Feature/DriverReferralRegistrationTest.php` (create)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `POST /api/auth/register/driver` now accepts optional `referral_code` (string, max 10) and persists `referred_by_user_id` on the created driver user. Task 2's frontend sends this field.

**Context:** `referred_by_user_id` is currently set only in `AuthController::register()` (line 123, customer registration). `registerDriver()` never sets it, so `ReferralService::processDriverReferral()` always returns at its `if ($driver->referred_by_user_id === null) return;` guard — the driver→driver referral is dead code. The referral link in `frontend/src/pages/driver/ProfilePage.tsx:197-206` produces `.../login?ref=CODE` that nothing consumes.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/DriverReferralRegistrationTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DriverReferralRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'phone'                     => '0911111111',
            'password'                  => '123456',
            'name'                      => 'Tài Xế Mới',
            'vehicle_make'              => 'Toyota',
            'vehicle_model'             => 'Vios',
            'vehicle_plate'             => '51G-99999',
            'vehicle_year'              => 2022,
            'vehicle_color'             => 'Trắng',
            'vehicle_type'              => 'sedan_4',
            'cccd_number'               => '0123456789',
            'gplx_number'               => 'B123456',
            'vehicle_reg_number'        => 'REG123',
            'vehicle_inspection_number' => 'INS123',
            'vehicle_inspection_expiry' => '2027-01-01',
            'insurance_number'          => 'BH123',
            'insurance_expiry'          => '2027-01-01',
        ], $overrides);
    }

    /** Đăng ký tài xế với mã giới thiệu hợp lệ lưu referred_by_user_id */
    public function test_driver_register_stores_referred_by_when_valid_referral_code(): void
    {
        $referrer = User::factory()->create(['role' => 'driver']);

        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => $referrer->referral_code,
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => $referrer->id,
        ]);
    }

    /** Mã giới thiệu không tồn tại thì bỏ qua, vẫn đăng ký thành công */
    public function test_driver_register_ignores_invalid_referral_code(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => 'SGO-ZZZZZZ',
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => null,
        ]);
    }

    /** Không gửi mã giới thiệu vẫn đăng ký thành công */
    public function test_driver_register_without_referral_code_succeeds(): void
    {
        $this->postJson('/api/auth/register/driver', $this->payload())->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'referred_by_user_id' => null,
        ]);
    }

    /** Không thể tự giới thiệu chính mình bằng mã của user cùng số điện thoại */
    public function test_driver_register_ignores_own_referral_code(): void
    {
        $self = User::factory()->create(['phone' => '0911111111', 'role' => 'customer']);

        $this->postJson('/api/auth/register/driver', $this->payload([
            'referral_code' => $self->referral_code,
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'phone'               => '0911111111',
            'role'                => 'driver',
            'referred_by_user_id' => null,
        ]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app php artisan test --filter=DriverReferralRegistrationTest`
Expected: FAIL — `test_driver_register_stores_referred_by_when_valid_referral_code` fails because `users.referred_by_user_id` is `null`, not `$referrer->id`. The other three tests pass already (they assert the current null behaviour).

- [ ] **Step 3: Add validation rule**

In `AuthController::registerDriver()`, add to the `$request->validate([...])` array (after the `'insurance_expiry'` line, `AuthController.php:152`):

```php
            'referral_code'             => 'nullable|string|max:10',
```

- [ ] **Step 4: Resolve the referrer and persist it**

Replace the `User::create([...])` block in `registerDriver()` (`AuthController.php:161-166`) with:

```php
        $referredById = null;
        if ($request->referral_code) {
            $referrer = User::where('referral_code', $request->referral_code)
                ->where('phone', '!=', $phone)
                ->first();
            if ($referrer) {
                $referredById = $referrer->id;
            }
        }

        $user = User::create([
            'phone'               => $phone,
            'name'                => $request->name,
            'password'            => Hash::make($request->password),
            'role'                => 'driver',
            'referred_by_user_id' => $referredById,
        ]);
```

The `where('phone', '!=', $phone)` guard prevents self-referral, which matters because one phone can own both a `customer` and a `driver` row (see `CustomerAlsoRegistersAsDriverTest`) — a user could otherwise paste their own customer referral code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec app php artisan test --filter=DriverReferralRegistrationTest`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the full backend suite for regressions**

Run: `docker compose exec app php artisan test`
Expected: PASS — no failures. `DriverRegisterTest` and `CustomerAlsoRegistersAsDriverTest` must still pass (they send no `referral_code`, which is `nullable`).

- [ ] **Step 7: Lint**

Run: `docker compose exec app ./vendor/bin/pint --dirty`
Expected: no style errors remaining.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/Auth/AuthController.php backend/tests/Feature/DriverReferralRegistrationTest.php
git commit -m "feat: driver registration accepts referral_code and stores referrer"
```

---

## Task 2: Frontend — driver registration sends `referral_code`

**Files:**
- Modify: `frontend/src/api/auth.ts:27-45`
- Modify: `frontend/src/pages/DriverRegisterPage.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register/driver` with optional `referral_code` (Task 1).
- Produces: `/register/driver?ref=CODE` persists the code to `localStorage['referral_code']` and submits it. Step 1 of the wizard renders an input with label `Mã giới thiệu` and placeholder `Nhập mã nếu có`. Task 4's e2e reads/fills this.

**Context:** `frontend/src/pages/RegisterPage.tsx:20-25` already implements exactly this pattern for customers — mirror it. `DriverRegisterPage.tsx` currently has no `ref`/referral handling at all.

- [ ] **Step 1: Extend the API function**

In `frontend/src/api/auth.ts`, add `referral_code` to the `driverRegisterApi` data type and forward it. The function becomes:

```ts
export const driverRegisterApi = (data: {
  phone: string
  password: string
  name: string
  vehicle_make: string
  vehicle_model: string
  vehicle_plate: string
  vehicle_year: number
  vehicle_color: string
  vehicle_type: 'sedan_4' | 'suv_5' | 'mpv_7'
  cccd_number: string
  gplx_number: string
  vehicle_reg_number: string
  vehicle_inspection_number: string
  vehicle_inspection_expiry: string
  insurance_number: string
  insurance_expiry: string
  referral_code?: string
}) => api.post<{ token: string; user: App.User }>('/auth/register/driver', data)
```

Keep the existing formatting of the surrounding lines; only the type members and nothing else change.

- [ ] **Step 2: Read `?ref=` into state**

In `frontend/src/pages/DriverRegisterPage.tsx`, add this state declaration next to the other `useState` calls (mirroring `RegisterPage.tsx:20-25`):

```tsx
  const [referralCode, setReferralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) localStorage.setItem('referral_code', ref)
    return ref ?? localStorage.getItem('referral_code') ?? ''
  })
```

- [ ] **Step 3: Render the referral input in step 1**

In the step-1 block (the phone-entry step, around `DriverRegisterPage.tsx:191`), insert this immediately before the `Tiếp theo` button:

```tsx
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-neutral-gray font-medium">Mã giới thiệu</label>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="Nhập mã nếu có"
              className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary transition-colors"
            />
          </div>
```

- [ ] **Step 4: Send it on submit and clear localStorage on success**

In the `driverRegisterApi({ ... })` call, add as the last property:

```tsx
        referral_code: referralCode || undefined,
```

And in the mutation's `onSuccess` handler (the one that calls `navigate('/driver/pending')`, `DriverRegisterPage.tsx:98`), add before the `navigate` call:

```tsx
      localStorage.removeItem('referral_code')
```

- [ ] **Step 5: Verify types and lint pass**

Run: `docker compose exec frontend npx tsc -b`
Expected: no errors.

Run: `docker compose exec frontend npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/auth.ts frontend/src/pages/DriverRegisterPage.tsx
git commit -m "feat: driver registration reads and submits referral code"
```

---

## Task 3: Playwright scaffold, fixtures, and MCP server

**Files:**
- Create: `.mcp.json`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/fixtures/testData.ts`
- Create: `frontend/e2e/fixtures/goong.ts`
- Create: `frontend/e2e/fixtures/auth.ts`
- Create: `frontend/e2e/fixtures/flows.ts`
- Create: `frontend/e2e/smoke.spec.ts`
- Modify: `frontend/package.json` (add `@playwright/test` devDependency + `test:e2e` script)
- Modify: `frontend/eslint.config.js` (ignore `e2e`)
- Modify: `.gitignore` (ignore Playwright output dirs)

**Interfaces:**
- Consumes: nothing from earlier tasks (runs against the app as-is).
- Produces, for Tasks 4–6:
  - `testData.ts`: `randomPhone(): string`, `TEST_PASSWORD = '000000'`, `SEEDED = { customer: '0901234567', driver: '0912345678', admin: '0923456789' }`, `APP = { customer: 'http://localhost:5173', driver: 'http://localhost:5174', admin: 'http://localhost:5175' }`, `PICKUP`/`DEST` place fixtures.
  - `goong.ts`: `stubGoong(page: Page): Promise<void>`
  - `auth.ts`: `loginExisting(page, appUrl, phone, password?)`, `registerCustomer(page, phone, opts?)`, `registerDriver(page, phone, opts?)` — all `Promise<void>`; plus `getCustomerReferralCode(page)` and `getDriverReferralCode(page)`, both `Promise<string>`.
  - `flows.ts`: `newActor(browser)` → `Promise<Page>` (fresh isolated browser context — every multi-actor spec uses this instead of redefining it), `createBooking(page, opts?)` → `Promise<string>` (booking id from URL), `driverAcceptTrip(page)`, `driverCompleteTrip(page)`, `adminApproveDriver(page, phone)`, `adminTopupDriver(page, phone, points)`, `adminToggleCollaborator(page, phone)`, `readDriverWalletPoints(page)` → `Promise<number>`, `readCollaboratorWalletPoints(page)` → `Promise<number>`, `countPersonalVouchers(page)` → `Promise<number>`.

**Context — Goong dependency:** `BookingFormPage.tsx:78` requires `distance_km >= 0.1`, which is only set by the `useEffect` at `BookingFormPage.tsx:161` after **both** `pickupLatLng` and `destLatLng` are set. Those are only set by `AddressInput`'s `onPlaceSelect`, which fires from `handleSelect()` after clicking a Goong autocomplete prediction. So the booking form is unusable without Goong responses. `frontend/.env` has a real key, but the suite stubs `https://rsapi.goong.io/**` for determinism (fixed distance → fixed auto-filled price → assertable point maths) and to avoid burning API quota. The three endpoints needing stubs (`frontend/src/api/goong.ts`): `/Place/AutoComplete`, `/Place/Detail`, `/DistanceMatrix`.

**Context — price auto-fill:** after distance is set, `applyKm()` (`BookingFormPage.tsx:164`) overwrites `price` from the active `PriceConfig`. Specs must therefore **read the auto-filled price** rather than assume one, then explicitly `fill()` a known price so downstream point maths is predictable.

- [ ] **Step 1: Install Playwright**

```bash
docker compose exec frontend npm install -D @playwright/test
```

Then install the Chromium binary **on the host** (tests run from the host, not inside the container, so they can reach `localhost:5173/5174/5175`):

```bash
cd frontend && npx playwright install chromium
```

- [ ] **Step 2: Add the test script**

In `frontend/package.json`, add to `"scripts"` after `"lint"`:

```json
    "test:e2e": "playwright test"
```

- [ ] **Step 3: Ignore build output and lint the e2e dir separately**

In `frontend/eslint.config.js`, change the `globalIgnores` line to:

```js
  globalIgnores(['dist', 'dist-driver', 'dist-admin', 'e2e', 'playwright-report', 'test-results']),
```

Append to the repo-root `.gitignore`:

```
frontend/playwright-report/
frontend/test-results/
```

- [ ] **Step 4: Write the Playwright config**

Create `frontend/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Specs share the seeded driver/admin accounts and the global "finding_driver"
  // trip pool, so parallel runs would steal each other's trips.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 430, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
```

- [ ] **Step 5: Write the test data fixture**

Create `frontend/e2e/fixtures/testData.ts`:

```ts
export const APP = {
  customer: 'http://localhost:5173',
  driver:   'http://localhost:5174',
  admin:    'http://localhost:5175',
} as const

export const TEST_PASSWORD = '000000'
export const TEST_OTP = '000000'

export const SEEDED = {
  customer: '0901234567',
  driver:   '0912345678',
  admin:    '0923456789',
} as const

/** Test-only phone range: 0999 + 6 random digits. Never collides with real Vietnamese prefixes. */
export function randomPhone(): string {
  return '0999' + Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
}

/** Fixed price used for every booking so wallet point maths is deterministic. */
export const BOOKING_PRICE = 500_000

export const PLACES = {
  pickup: {
    placeId: 'e2e-pickup',
    mainText: 'Khách sạn E2E',
    secondaryText: 'Quận 1, TP.HCM',
    address: 'Khách sạn E2E, Quận 1, TP.HCM',
    lat: 10.7769,
    lng: 106.7009,
  },
  dest: {
    placeId: 'e2e-dest',
    mainText: 'Sân bay Tân Sơn Nhất',
    secondaryText: 'Tân Bình, TP.HCM',
    address: 'Sân bay Tân Sơn Nhất, Tân Bình, TP.HCM',
    lat: 10.8188,
    lng: 106.6519,
  },
} as const

/** Stubbed driving distance in metres → 8.0 km after the client rounds it. */
export const STUB_DISTANCE_METRES = 8_000
```

- [ ] **Step 6: Write the Goong stub fixture**

Create `frontend/e2e/fixtures/goong.ts`:

```ts
import type { Page } from '@playwright/test'
import { PLACES, STUB_DISTANCE_METRES } from './testData'

type Place = typeof PLACES.pickup

const ALL: Place[] = [PLACES.pickup, PLACES.dest]

/**
 * Intercepts every Goong Maps call so address autocomplete, place detail, and
 * distance are deterministic. Must be called before the page navigates.
 */
export async function stubGoong(page: Page): Promise<void> {
  await page.route('https://rsapi.goong.io/Place/AutoComplete**', async (route) => {
    const input = (new URL(route.request().url()).searchParams.get('input') ?? '').toLowerCase()
    const matches = ALL.filter(
      (p) => p.mainText.toLowerCase().includes(input) || p.address.toLowerCase().includes(input),
    )
    await route.fulfill({
      json: {
        predictions: (matches.length > 0 ? matches : ALL).map((p) => ({
          place_id: p.placeId,
          description: p.address,
          structured_formatting: { main_text: p.mainText, secondary_text: p.secondaryText },
        })),
      },
    })
  })

  await page.route('https://rsapi.goong.io/Place/Detail**', async (route) => {
    const placeId = new URL(route.request().url()).searchParams.get('place_id')
    const place = ALL.find((p) => p.placeId === placeId) ?? PLACES.pickup
    await route.fulfill({
      json: {
        result: {
          formatted_address: place.address,
          geometry: { location: { lat: place.lat, lng: place.lng } },
        },
      },
    })
  })

  await page.route('https://rsapi.goong.io/DistanceMatrix**', async (route) => {
    await route.fulfill({
      json: {
        rows: [{ elements: [{ status: 'OK', distance: { value: STUB_DISTANCE_METRES } }] }],
      },
    })
  })
}
```

- [ ] **Step 7: Write the auth fixture**

Create `frontend/e2e/fixtures/auth.ts`:

```ts
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { APP, TEST_OTP, TEST_PASSWORD } from './testData'

/** Logs in an already-registered account (phone → password). */
export async function loginExisting(
  page: Page,
  appUrl: string,
  phone: string,
  password: string = TEST_PASSWORD,
): Promise<void> {
  await page.goto(`${appUrl}/login`)
  await page.getByPlaceholder('9xx xxx xxx').fill(phone)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.getByPlaceholder('••••••').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

async function fillOtp(page: Page): Promise<void> {
  const boxes = page.locator('input[type="tel"][maxlength="1"]')
  await expect(boxes.first()).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await boxes.nth(i).fill(TEST_OTP[i])
  }
}

async function acceptAgreements(page: Page): Promise<void> {
  const boxes = page.locator('input[type="checkbox"]')
  await expect(boxes).toHaveCount(2)
  await boxes.nth(0).check()
  await boxes.nth(1).check()
}

/** Registers a new customer through the 4-step wizard. Lands on /customer/booking. */
export async function registerCustomer(
  page: Page,
  phone: string,
  opts: { referralCode?: string; name?: string } = {},
): Promise<void> {
  const url = opts.referralCode
    ? `${APP.customer}/register?ref=${opts.referralCode}`
    : `${APP.customer}/register`
  await page.goto(url)

  await page.getByPlaceholder('9xx xxx xxx').fill(phone)
  if (opts.referralCode) {
    await expect(page.getByPlaceholder('Nhập mã nếu có')).toHaveValue(opts.referralCode)
  }
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  await fillOtp(page)
  await page.getByRole('button', { name: 'Xác nhận OTP' }).click()

  await page.getByPlaceholder('Nguyễn Văn A').fill(opts.name ?? `Khách E2E ${phone.slice(-4)}`)
  await page.getByPlaceholder('••••••').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  await acceptAgreements(page)
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()

  await expect(page).toHaveURL(/\/customer\/booking/)
}

/**
 * Registers a new driver through the 6-step wizard. Lands on /driver/pending —
 * the driver still needs admin approval before they can accept trips.
 */
export async function registerDriver(
  page: Page,
  phone: string,
  opts: { referralCode?: string; name?: string } = {},
): Promise<void> {
  const url = opts.referralCode
    ? `${APP.driver}/register/driver?ref=${opts.referralCode}`
    : `${APP.driver}/register/driver`
  await page.goto(url)

  await page.getByPlaceholder('9xx xxx xxx').fill(phone)
  if (opts.referralCode) {
    await expect(page.getByPlaceholder('Nhập mã nếu có')).toHaveValue(opts.referralCode)
  }
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  await fillOtp(page)
  await page.getByRole('button', { name: 'Xác nhận OTP' }).click()

  await page.getByPlaceholder('Nguyễn Văn A').fill(opts.name ?? `Tài Xế E2E ${phone.slice(-4)}`)
  await page.getByPlaceholder('••••••').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  // Step 4 — vehicle. sedan_4 is the default selection; a sedan fits sedan_4 bookings.
  await page.getByRole('button', { name: 'Sedan 4 chỗ' }).click()
  await page.getByPlaceholder('Toyota').fill('Toyota')
  await page.getByPlaceholder('Camry').fill('Vios')
  await page.getByPlaceholder('51G-12345').fill(`51G-${phone.slice(-5)}`)
  await page.getByPlaceholder('2022').fill('2022')
  await page.getByPlaceholder('Trắng').fill('Trắng')
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  // Step 5 — legal documents. Expiry dates must be in the future (`after:today`).
  await page.getByPlaceholder('079123456789').fill('079123456789')
  await page.getByPlaceholder('012345678910').fill('012345678910')
  await page.getByPlaceholder('29A-12345').fill('29A-12345')
  await page.getByPlaceholder('Số đăng kiểm').fill('INS-E2E')
  await page.getByPlaceholder('Số bảo hiểm').fill('BH-E2E')
  const dates = page.locator('input[type="date"]')
  await expect(dates).toHaveCount(2)
  await dates.nth(0).fill('2030-01-01')
  await dates.nth(1).fill('2030-01-01')
  await page.getByRole('button', { name: 'Tiếp theo' }).click()

  await acceptAgreements(page)
  await page.getByRole('button', { name: 'Đăng ký tài xế' }).click()

  await expect(page).toHaveURL(/\/driver\/pending/)
}

/** Reads the referral code shown in the customer Profile sheet. */
export async function getCustomerReferralCode(page: Page): Promise<string> {
  await page.goto(`${APP.customer}/customer/profile`)
  await page.getByText('Giới thiệu bạn bè').click()
  const code = await page.getByText(/^SGO-/).first().textContent()
  expect(code).toBeTruthy()
  await page.getByRole('button', { name: 'Đóng' }).click()
  return code!.trim()
}

/** Reads the referral code shown inline on the driver Profile page. */
export async function getDriverReferralCode(page: Page): Promise<string> {
  await page.goto(`${APP.driver}/driver/profile`)
  await expect(page.getByText('Giới thiệu tài xế')).toBeVisible()
  const code = await page.getByText(/^SGO-/).first().textContent()
  expect(code).toBeTruthy()
  return code!.trim()
}
```

Note: the referral code prefix comes from `VITE_CODE_PREFIX=SGO` (`frontend/.env.example`) — codes look like `SGO-A1B2C3`. If the running instance uses a different prefix, adjust the `/^SGO-/` regex in both helpers to match.

- [ ] **Step 8: Write the flows fixture**

Create `frontend/e2e/fixtures/flows.ts`:

```ts
import { expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { APP, BOOKING_PRICE, PLACES } from './testData'

/** Opens a fresh isolated browser context and returns its page — one per actor in a multi-role spec. */
export async function newActor(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return await context.newPage()
}

/** Parses "1.240 đ." / "1,240" style Vietnamese number text into a plain number. */
function parseVnNumber(text: string): number {
  const digits = text.replace(/[^\d]/g, '')
  return digits === '' ? 0 : Number(digits)
}

async function selectAddress(page: Page, placeholder: string, mainText: string): Promise<void> {
  const input = page.getByPlaceholder(placeholder)
  await input.click()
  await input.fill(mainText)
  await page.getByText(mainText, { exact: true }).click()
  await expect(input).toHaveValue(new RegExp(mainText))
}

/**
 * Creates a booking as the logged-in customer and returns the new booking id.
 * `stubGoong` must already be active on this page.
 */
export async function createBooking(
  page: Page,
  opts: { collectionFee?: number } = {},
): Promise<string> {
  await page.goto(`${APP.customer}/customer/booking`)

  await selectAddress(page, 'Tìm địa điểm đón...', PLACES.pickup.mainText)
  await selectAddress(page, 'Sân bay hoặc điểm đến...', PLACES.dest.mainText)

  // Distance arrives asynchronously and overwrites `price`, so wait for the
  // auto-filled value before setting our own deterministic price.
  const priceInput = page.locator('input[name="price"]')
  await expect(priceInput).not.toHaveValue('')
  await expect(priceInput).not.toHaveValue('0')
  await priceInput.fill(String(BOOKING_PRICE))

  if (opts.collectionFee !== undefined) {
    await page.locator('input[name="collection_fee"]').fill(String(opts.collectionFee))
  }

  await page.getByRole('button', { name: 'Đặt xe →' }).click()

  await expect(page).toHaveURL(/\/customer\/booking\/\d+/)
  const id = page.url().split('/').pop()!
  return id
}

/**
 * Driver accepts the trip created by `createBooking` and lands on its detail page.
 *
 * BookingSeeder leaves three `finding_driver` bookings in the pool, so picking the
 * first "Nhận cuốc" button would accept an unrelated seeded trip. The card is
 * instead located by our stubbed pickup address, then narrowed to the nearest
 * ancestor that actually contains an accept button.
 */
export async function driverAcceptTrip(page: Page): Promise<void> {
  await page.goto(`${APP.driver}/driver/trips`)
  const card = page
    .getByText(PLACES.pickup.address, { exact: true })
    .first()
    .locator('xpath=ancestor::div[.//button[normalize-space()="Nhận cuốc"]][1]')
  const acceptButton = card.getByRole('button', { name: 'Nhận cuốc' })
  await expect(acceptButton).toBeVisible()
  await acceptButton.click()
  await expect(page).toHaveURL(/\/driver\/trips\/\d+/)
}

/** Drives the accepted trip on the current detail page through to `completed`. */
export async function driverCompleteTrip(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Đã đón khách' }).click()
  await page.getByRole('button', { name: 'Hoàn thành chuyến' }).click()
  await expect(page).toHaveURL(/\/driver\/trips$/)
}

/** Admin approves a pending driver, found by phone. */
export async function adminApproveDriver(page: Page, phone: string): Promise<void> {
  await page.goto(`${APP.admin}/drivers`)
  await page.getByPlaceholder('Tìm theo tên, SĐT, biển số').fill(phone)
  await expect(page.getByText(phone)).toBeVisible()
  await page.getByRole('button', { name: 'Duyệt' }).click()
  await expect(page.getByRole('button', { name: 'Duyệt' })).toHaveCount(0)
}

/** Admin manually tops up a driver's wallet, found by phone. */
export async function adminTopupDriver(page: Page, phone: string, points: number): Promise<void> {
  await page.goto(`${APP.admin}/drivers`)
  await page.getByPlaceholder('Tìm theo tên, SĐT, biển số').fill(phone)
  await expect(page.getByText(phone)).toBeVisible()
  await page.getByRole('button', { name: 'Nạp điểm' }).first().click()
  await expect(page.getByText('Nạp điểm thủ công')).toBeVisible()
  await page.getByPlaceholder('Nhập số điểm cần nạp').fill(String(points))
  // The modal's confirm button shares its label with the row button that opened it.
  await page.getByRole('button', { name: 'Nạp điểm' }).last().click()
  await expect(page.getByText('Nạp điểm thủ công')).toHaveCount(0)
}

/** Admin toggles a customer's collaborator status, found by phone. */
export async function adminToggleCollaborator(page: Page, phone: string): Promise<void> {
  await page.goto(`${APP.admin}/customers`)
  await page.getByPlaceholder('Tìm theo tên, số điện thoại').fill(phone)
  await page.getByText(phone).click()
  await page.getByRole('button', { name: 'Kích hoạt CTV' }).click()
  await expect(page.getByRole('button', { name: 'Huỷ CTV' })).toBeVisible()
}

/** Reads the driver's wallet point balance. */
export async function readDriverWalletPoints(page: Page): Promise<number> {
  await page.goto(`${APP.driver}/driver/wallet`)
  const label = page.getByText('Số dư điểm')
  await expect(label).toBeVisible()
  const value = await label.locator('xpath=following-sibling::p[1]').textContent()
  return parseVnNumber(value ?? '0')
}

/** Reads the collaborator wallet point balance on the customer app. */
export async function readCollaboratorWalletPoints(page: Page): Promise<number> {
  await page.goto(`${APP.customer}/customer/collaborator/wallet`)
  await expect(page.getByText('Ví Cộng Tác Viên')).toBeVisible()
  const value = await page.getByText(/\d+\s*điểm/).first().textContent()
  return parseVnNumber(value ?? '0')
}

/** Counts the customer's personal (referral) vouchers in the Profile voucher sheet. */
export async function countPersonalVouchers(page: Page): Promise<number> {
  await page.goto(`${APP.customer}/customer/profile`)
  await page.getByText('Voucher của tôi').click()
  await expect(page.getByText('Voucher của tôi').last()).toBeVisible()
  return await page.getByText(/^REF-/).count()
}
```

- [ ] **Step 9: Write a smoke spec that proves the scaffold works**

Create `frontend/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import { createBooking, readDriverWalletPoints } from './fixtures/flows'

test('khách hàng seed đăng nhập và đặt được chuyến', async ({ page }) => {
  await stubGoong(page)
  await loginExisting(page, APP.customer, SEEDED.customer)
  await expect(page).toHaveURL(/\/customer\/booking/)

  const bookingId = await createBooking(page)
  expect(Number(bookingId)).toBeGreaterThan(0)
})

test('tài xế seed đăng nhập và đọc được số dư ví', async ({ page }) => {
  await loginExisting(page, APP.driver, SEEDED.driver)
  await expect(page).toHaveURL(/\/driver\/trips/)

  const points = await readDriverWalletPoints(page)
  expect(points).toBeGreaterThan(0)
})

test('admin seed đăng nhập vào dashboard', async ({ page }) => {
  await loginExisting(page, APP.admin, SEEDED.admin)
  await expect(page).toHaveURL(/\/dashboard/)
})
```

- [ ] **Step 10: Reset the database and run the smoke spec**

⚠️ `make fresh` **destroys all local database data**. Confirm the local DB holds nothing worth keeping before running it.

```bash
make up
make fresh
cd frontend && npx playwright test e2e/smoke.spec.ts
```

Expected: 3 passed. If the customer booking test fails on the `input[name="price"]` wait, the seeded `PriceConfig` for `one_way`/`sedan_4` may be inactive — check `backend/database/seeders/PriceConfigSeeder.php` and fall back to filling `price` directly without waiting for auto-fill.

- [ ] **Step 11: Register the Playwright MCP server**

Create `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

This is for interactive UI exploration while authoring tests; it is not used by the automated suite.

- [ ] **Step 12: Commit**

```bash
git add .mcp.json .gitignore frontend/package.json frontend/package-lock.json \
        frontend/playwright.config.ts frontend/eslint.config.js frontend/e2e
git commit -m "test: scaffold Playwright e2e suite with Goong stubs and auth fixtures"
```

---

## Task 4: Referral driver→driver spec (TC1.1–1.4)

**Files:**
- Create: `frontend/e2e/referral-driver.spec.ts`

**Interfaces:**
- Consumes: `referral_code` support in driver registration (Tasks 1–2); all fixtures from Task 3.
- Produces: nothing consumed by later tasks.

**Context — reward mechanics** (`backend/app/Services/ReferralService.php:18-35`): `processDriverReferral` pays **100 points** to each side, and only when *all* guards pass — referrer's role is `driver`, referee's `driver_profiles.trips_count >= 1`, and `driver_profiles.status === 'active'`. It is invoked from two places, so whichever condition is satisfied last triggers the payout: `AdminDriverController::approve()` (`DriverController.php:103`) and `TripController::updateStatus()` on completion (`TripController.php:201`). `referral_rewarded_at` prevents double payment.

**Context — driver B needs points to accept a trip.** `TripController::accept()` (`TripController.php:66-79`) debits 20% of `(price - discount)` as the app fee and **rejects the accept with 422 if the wallet is short**. A freshly registered driver has 0 points (`AuthController.php:185`), so the admin must top them up first. With `BOOKING_PRICE = 500_000` the fee is 100 points; top up 500 to leave room for two trips (TC1.4 needs a second).

**Context — driver B must re-authenticate after approval.** `RequireDriverActive` (`frontend/src/router/guards.tsx:12-19`) reads `approval_status` from the **persisted** Zustand store, and `DriverLayout` never refetches `/auth/me` (only `CustomerLayout` does, `CustomerLayout.tsx:28`). Every `/driver/*` page including `/driver/wallet` sits behind that guard (`router/driver.tsx:46-61`). So the context that registered driver B still believes it is `pending` and would be bounced to `/driver/pending`. The spec therefore closes B's registration context and opens a **fresh** context that logs in normally — this is also why registration and post-approval work use two different page objects.

- [ ] **Step 1: Write the spec**

Create `frontend/e2e/referral-driver.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { getDriverReferralCode, loginExisting, registerDriver } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import {
  adminApproveDriver,
  adminTopupDriver,
  createBooking,
  driverAcceptTrip,
  driverCompleteTrip,
  newActor,
  readDriverWalletPoints,
} from './fixtures/flows'

const DRIVER_REFERRAL_REWARD = 100
const APP_FEE_POINTS = 100 // 20% of 500.000đ, at 1 point = 1.000đ

test.describe('Referral tài xế → tài xế', () => {
  test('thưởng 100 điểm cho cả hai bên sau chuyến đầu tiên của tài xế được giới thiệu', async ({
    browser,
  }) => {
    const driverBPhone = randomPhone()
    const customerPhone = SEEDED.customer

    // ── TC1.1 — tài xế A lấy mã, tài xế B đăng ký qua link ──────────────────
    const driverA = await newActor(browser)
    await loginExisting(driverA, APP.driver, SEEDED.driver)
    const referralCode = await getDriverReferralCode(driverA)
    expect(referralCode).toMatch(/-/)
    const aPointsBefore = await readDriverWalletPoints(driverA)

    const driverBSignup = await newActor(browser)
    await registerDriver(driverBSignup, driverBPhone, { referralCode })

    // ── TC1.2 — admin duyệt B nhưng B chưa có chuyến nào → chưa thưởng ──────
    const admin = await newActor(browser)
    await loginExisting(admin, APP.admin, SEEDED.admin)
    await adminApproveDriver(admin, driverBPhone)

    // Context đăng ký vẫn giữ approval_status='pending' trong store đã persist,
    // nên phải mở context mới và đăng nhập lại để guard cho vào /driver/*.
    await driverBSignup.context().close()
    const driverB = await newActor(browser)
    await loginExisting(driverB, APP.driver, driverBPhone)
    await expect(driverB).toHaveURL(/\/driver\/trips/)

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsBefore)
    expect(await readDriverWalletPoints(driverB)).toBe(0)

    // B cần điểm để trả phí app 20% khi nhận cuốc.
    await adminTopupDriver(admin, driverBPhone, 500)
    expect(await readDriverWalletPoints(driverB)).toBe(500)

    // ── TC1.3 — B hoàn thành chuyến đầu tiên → cả A và B nhận 100 điểm ──────
    const customer = await newActor(browser)
    await stubGoong(customer)
    await loginExisting(customer, APP.customer, customerPhone)
    await createBooking(customer)

    await driverAcceptTrip(driverB)
    await driverCompleteTrip(driverB)

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsBefore + DRIVER_REFERRAL_REWARD)
    // B: nạp 500 − phí app 100 + thưởng 100
    expect(await readDriverWalletPoints(driverB)).toBe(500 - APP_FEE_POINTS + DRIVER_REFERRAL_REWARD)

    // ── TC1.4 — chuyến thứ hai không phát thêm thưởng referral ──────────────
    const aPointsAfterReward = await readDriverWalletPoints(driverA)
    const bPointsAfterReward = await readDriverWalletPoints(driverB)

    await createBooking(customer)
    await driverAcceptTrip(driverB)
    await driverCompleteTrip(driverB)

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsAfterReward)
    // B chỉ mất thêm phí app, không nhận thêm thưởng.
    expect(await readDriverWalletPoints(driverB)).toBe(bPointsAfterReward - APP_FEE_POINTS)
  })
})
```

- [ ] **Step 2: Reset the database and run the spec**

⚠️ `make fresh` destroys all local database data.

```bash
make fresh
cd frontend && npx playwright test e2e/referral-driver.spec.ts
```

Expected: PASS. If it fails, open the trace (`npx playwright show-report`) before changing assertions — a genuine failure here means the referral wiring from Tasks 1–2 is incomplete, not that the test is wrong.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/referral-driver.spec.ts
git commit -m "test: e2e coverage for driver-to-driver referral rewards"
```

---

## Task 5: Referral customer→customer spec (TC2.1–2.4)

**Files:**
- Create: `frontend/e2e/referral-customer.spec.ts`

**Interfaces:**
- Consumes: fixtures from Task 3. No dependency on Tasks 1–2 (customer referral already works).
- Produces: nothing consumed by later tasks.

**Context — reward mechanics** (`ReferralService.php:37-53`): `processCustomerReferral` fires from `TripController::updateStatus()` on completion (`TripController.php:216`) and issues **2 vouchers of 50.000đ to the referrer** and **4 to the new customer**, each coded `REF-{userId}-{RAND4}`. The guard `if ($completedCount !== 1) return;` means it fires on exactly the first completed booking — note it does not check the referrer's role.

**Context — where personal vouchers are visible:** only `frontend/src/pages/customer/ProfilePage.tsx:234` passes `showPersonal` to `VoucherSheet`, so referral vouchers appear under the Profile → `Voucher của tôi` sheet, section `Voucher giới thiệu của tôi`. The booking form's voucher sheet shows public vouchers only — do not look for `REF-` codes there.

**Context — active-booking redirect:** `BookingFormPage.tsx:252-256` force-redirects a non-collaborator customer with an active booking away from the form. Each booking in this spec must therefore be completed (or the customer be fresh) before creating the next one.

- [ ] **Step 1: Write the spec**

Create `frontend/e2e/referral-customer.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { getCustomerReferralCode, loginExisting, registerCustomer } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import {
  countPersonalVouchers,
  createBooking,
  driverAcceptTrip,
  driverCompleteTrip,
  newActor,
} from './fixtures/flows'

const REFERRER_VOUCHERS = 2
const NEW_CUSTOMER_VOUCHERS = 4

test.describe('Referral khách → khách', () => {
  test('phát voucher 50k cho cả hai bên sau chuyến đầu tiên của khách được giới thiệu', async ({
    browser,
  }) => {
    const customerDPhone = randomPhone()

    // ── TC2.1 — khách C lấy mã, khách D đăng ký qua link ────────────────────
    const customerC = await newActor(browser)
    await loginExisting(customerC, APP.customer, SEEDED.customer)
    const referralCode = await getCustomerReferralCode(customerC)
    const cVouchersBefore = await countPersonalVouchers(customerC)

    const customerD = await newActor(browser)
    await stubGoong(customerD)
    await registerCustomer(customerD, customerDPhone, { referralCode })

    expect(await countPersonalVouchers(customerD)).toBe(0)

    // ── TC2.2 — D đặt chuyến nhưng chưa hoàn thành → chưa phát voucher ──────
    await createBooking(customerD)

    expect(await countPersonalVouchers(customerC)).toBe(cVouchersBefore)
    expect(await countPersonalVouchers(customerD)).toBe(0)

    // ── TC2.3 — tài xế hoàn thành chuyến đầu tiên của D → phát voucher ──────
    const driver = await newActor(browser)
    await loginExisting(driver, APP.driver, SEEDED.driver)
    await driverAcceptTrip(driver)
    await driverCompleteTrip(driver)

    expect(await countPersonalVouchers(customerC)).toBe(cVouchersBefore + REFERRER_VOUCHERS)
    expect(await countPersonalVouchers(customerD)).toBe(NEW_CUSTOMER_VOUCHERS)

    // ── TC2.4 — chuyến thứ hai không phát thêm voucher ──────────────────────
    await createBooking(customerD)
    await driverAcceptTrip(driver)
    await driverCompleteTrip(driver)

    expect(await countPersonalVouchers(customerC)).toBe(cVouchersBefore + REFERRER_VOUCHERS)
    expect(await countPersonalVouchers(customerD)).toBe(NEW_CUSTOMER_VOUCHERS)
  })
})
```

- [ ] **Step 2: Reset the database and run the spec**

⚠️ `make fresh` destroys all local database data.

```bash
make fresh
cd frontend && npx playwright test e2e/referral-customer.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/referral-customer.spec.ts
git commit -m "test: e2e coverage for customer-to-customer referral vouchers"
```

---

## Task 6: Collaborator (thu hộ) spec (TC3.1–3.3)

**Files:**
- Create: `frontend/e2e/collaborator.spec.ts`

**Interfaces:**
- Consumes: fixtures from Task 3.
- Produces: nothing — final task.

**Context — thu hộ mechanics** (`TripController::updateStatus()`, `TripController.php:167-199`): on completion the driver's wallet is **debited the full `collection_fee`** in points (the driver collected that cash from the customer) and the collaborator's wallet is **credited `floor(collection_fee * 0.80 / 1000)`** points; the company keeps the 20% gap. With `collection_fee = 200_000`: driver −200 points, collaborator +160 points.

**Context — driver wallet must cover both charges.** The seeded driver starts at 1,240 points. Accepting costs 100 points (20% of 500.000đ) and completing costs a further 200 points for the thu hộ — well within budget.

**Context — the field is collaborator-gated.** `BookingFormPage.tsx:523` renders the `Thu Hộ (tuỳ chọn)` input only when `user?.is_collaborator` is true, read from `useAuthStore`. Because the store is persisted, the collaborator flag must be refreshed after the admin toggles it — the spec logs the collaborator in *after* the toggle to guarantee a fresh `/auth/me`.

- [ ] **Step 1: Write the spec**

Create `frontend/e2e/collaborator.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { loginExisting, registerCustomer } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import {
  adminToggleCollaborator,
  createBooking,
  driverAcceptTrip,
  driverCompleteTrip,
  newActor,
  readCollaboratorWalletPoints,
  readDriverWalletPoints,
} from './fixtures/flows'

const COLLECTION_FEE = 200_000
const COLLABORATOR_CREDIT = 160 // floor(200.000 * 0.80 / 1.000)
const COLLECTION_DEBIT = 200 // full thu hộ debited from the driver
const APP_FEE_POINTS = 100 // 20% of 500.000đ

test.describe('Cộng tác viên — Thu hộ', () => {
  test('khách thường không thấy field Thu Hộ', async ({ browser }) => {
    // ── TC3.2 ──────────────────────────────────────────────────────────────
    const customerF = await newActor(browser)
    await stubGoong(customerF)
    await registerCustomer(customerF, randomPhone())

    await customerF.goto(`${APP.customer}/customer/booking`)
    await expect(customerF.getByText('Thu Hộ (tuỳ chọn)')).toHaveCount(0)
    await expect(customerF.locator('input[name="collection_fee"]')).toHaveCount(0)
  })

  test('CTV nhận 80% thu hộ vào ví, tài xế bị trừ đủ khoản thu hộ', async ({ browser }) => {
    const collaboratorPhone = randomPhone()

    // Tạo khách E trước, rồi admin mới kích hoạt CTV.
    const setup = await newActor(browser)
    await registerCustomer(setup, collaboratorPhone)
    await setup.close()

    // ── TC3.1 — admin bật CTV cho khách E ──────────────────────────────────
    const admin = await newActor(browser)
    await loginExisting(admin, APP.admin, SEEDED.admin)
    await adminToggleCollaborator(admin, collaboratorPhone)

    // Đăng nhập lại sau khi bật cờ để store nhận is_collaborator mới.
    const collaborator = await newActor(browser)
    await stubGoong(collaborator)
    await loginExisting(collaborator, APP.customer, collaboratorPhone)

    expect(await readCollaboratorWalletPoints(collaborator)).toBe(0)

    // ── TC3.3 — đặt chuyến kèm thu hộ, tài xế hoàn thành ───────────────────
    await collaborator.goto(`${APP.customer}/customer/booking`)
    await expect(collaborator.getByText('Thu Hộ (tuỳ chọn)')).toBeVisible()
    await createBooking(collaborator, { collectionFee: COLLECTION_FEE })

    const driver = await newActor(browser)
    await loginExisting(driver, APP.driver, SEEDED.driver)
    const driverPointsBefore = await readDriverWalletPoints(driver)

    await driverAcceptTrip(driver)
    await driverCompleteTrip(driver)

    expect(await readDriverWalletPoints(driver)).toBe(
      driverPointsBefore - APP_FEE_POINTS - COLLECTION_DEBIT,
    )
    expect(await readCollaboratorWalletPoints(collaborator)).toBe(COLLABORATOR_CREDIT)
  })
})
```

- [ ] **Step 2: Reset the database and run the spec**

⚠️ `make fresh` destroys all local database data.

```bash
make fresh
cd frontend && npx playwright test e2e/collaborator.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run the whole suite from a clean database**

```bash
make fresh
cd frontend && npx playwright test
```

Expected: all specs pass. `fullyParallel: false` and `workers: 1` mean they run sequentially, so shared seeded accounts do not collide.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/collaborator.spec.ts
git commit -m "test: e2e coverage for collaborator collection fee split"
```

---

## Running the suite

```bash
make up                        # start containers (frontend dev servers included)
make fresh                     # ⚠️ wipes the local DB, reseeds fixtures
cd frontend && npm run test:e2e
npx playwright show-report     # inspect failures with traces
```
