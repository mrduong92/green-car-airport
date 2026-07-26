import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { APP, BOOKING_PRICE, PLACES } from './testData'

// Every context newActor() opens is tracked here so it can be force-closed by
// `cleanupActors` below, even if the test that created it throws before
// reaching its own explicit `context().close()` calls. Contexts come from the
// worker-scoped `browser` fixture, so an unclosed one (and the SSE stream its
// page holds open against PHP-FPM's small pool) would otherwise survive into
// the next test.
//
// This array is shared by every spec file that imports this module — Node
// only executes a module's top-level code once per process and then serves
// the same cached instance to every later importer, running all three spec
// files (workers: 1, fullyParallel: false) in the same process. That sharing
// is harmless here because tests run strictly one at a time: whichever spec
// file's test is currently executing is the only one pushing into the array,
// and its own `afterEach` (registered below, per spec file) drains it before
// the next test starts.
//
// A `test.afterEach` call placed here instead — at this module's own top
// level — would NOT achieve that: it would run only once, for whichever spec
// file happens to import this module first (confirmed by an instrumented
// run: a debug counter placed in such a hook fired only for collaborator.spec.ts's
// two tests and never for referral-customer.spec.ts or referral-driver.spec.ts,
// because those files receive the already-initialized cached module and never
// re-run its top-level code). So each spec file registers its own
// `test.afterEach(cleanupActors)` instead.
const openContexts: BrowserContext[] = []

/** Opens a fresh isolated browser context and returns its page — one per actor in a multi-role spec. */
export async function newActor(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  openContexts.push(context)
  return await context.newPage()
}

/**
 * Force-closes every context `newActor` has opened since the last call.
 * Each spec file that uses `newActor` must register this itself, e.g.
 * `test.afterEach(cleanupActors)` at the top of the file — see the note on
 * `openContexts` above for why this can't just be registered once in here.
 * Closing an already-closed context is a no-op in Playwright, so this is safe
 * to run even for actors a test already closed itself.
 */
export async function cleanupActors(): Promise<void> {
  const contexts = openContexts.splice(0)
  await Promise.all(contexts.map((ctx) => ctx.close()))
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
 *
 * Must be called for a customer with no active booking — BookingFormPage
 * redirects any non-collaborator with an active (`finding_driver`/`accepted`/
 * etc.) booking to that booking's status page instead of rendering the form.
 * The seeded customer (SEEDED.customer) owns one from BookingSeeder, so this
 * only works for freshly registered customers.
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

  // The POST is proxied through the Vite dev server, which can exceed the
  // 15s default expect timeout late in a long, many-context suite even
  // though the booking is created promptly server-side — give the
  // navigation more room without weakening what's asserted.
  await expect(page).toHaveURL(/\/customer\/booking\/\d+/, { timeout: 60_000 })
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
  // exact:true avoids matching the always-present "Chờ duyệt" filter chip,
  // which contains "duyệt" as a substring of the default non-exact match.
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0)
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
  // The "Số dư điểm" label is static markup — it's visible before the wallet
  // query resolves, so reading right after the label appears can capture the
  // pre-load "0" placeholder. `networkidle` can't be used to wait it out: the
  // driver layout holds an SSE stream open for the whole session, so the
  // network never goes quiet. Instead take the authoritative balance from the
  // /driver/wallet response and poll until the DOM agrees with it.
  //
  // The response must not be awaited concurrently with the navigation:
  // TripListPage requests this same endpoint, so an in-flight response from
  // the page we're leaving would match first and its body is discarded the
  // moment we navigate away. Committing the navigation first discards those
  // stale requests, and the new page's fetch can only fire after its JS runs.
  await page.goto(`${APP.driver}/driver/wallet`, { waitUntil: 'commit' })
  const res = await page.waitForResponse((r) => new URL(r.url()).pathname === '/api/driver/wallet')
  const points = ((await res.json()) as { points: number }).points
  const label = page.getByText('Số dư điểm')
  await expect(label).toBeVisible()
  const value = label.locator('xpath=following-sibling::p[1]')
  await expect.poll(async () => parseVnNumber((await value.textContent()) ?? '0')).toBe(points)
  return points
}

/** Reads the collaborator wallet point balance on the customer app. */
export async function readCollaboratorWalletPoints(page: Page): Promise<number> {
  // Same static-label-vs-async-data race as readDriverWalletPoints, and the
  // same reason `networkidle` is unusable — the customer layout keeps an SSE
  // stream open, so the network never goes quiet. Take the balance from the
  // wallet response and poll until the DOM agrees with it. The navigation is
  // committed before waiting, for the same reason as readDriverWalletPoints —
  // ProfilePage requests this same endpoint, and a response from the page we
  // are leaving loses its body as soon as we navigate away.
  await page.goto(`${APP.customer}/customer/collaborator/wallet`, { waitUntil: 'commit' })
  const res = await page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/customer/collaborator/wallet',
  )
  const points = ((await res.json()) as { points: number }).points
  await expect(page.getByText('Ví Cộng Tác Viên')).toBeVisible()
  const value = page.getByText(/\d+\s*điểm/).first()
  await expect.poll(async () => parseVnNumber((await value.textContent()) ?? '0')).toBe(points)
  return points
}

/** Counts the customer's personal (referral) vouchers in the Profile voucher sheet. */
export async function countPersonalVouchers(page: Page): Promise<number> {
  await page.goto(`${APP.customer}/customer/profile`)
  // `networkidle` can't be used here — the customer layout holds an SSE stream
  // open for the whole session, so the network never goes quiet. The count can
  // legitimately be 0, so there's no element whose appearance marks the render
  // as done: take the count from the /my-vouchers response and poll until the
  // DOM agrees. Every personal voucher is REF-coded (issued by ReferralService),
  // so the REF- rows and the response body are the same set.
  const [res] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/customer/my-vouchers'),
    page.getByText('Voucher của tôi').click(),
  ])
  const expected = ((await res.json()) as unknown[]).length
  // `getByText('Voucher của tôi').last()` is vacuous when expected is 0: the
  // profile menu row that opens the sheet has that exact text too, and
  // VoucherSheet.tsx returns null while closed, so before the sheet ever
  // renders there is exactly one match — already visible — and the assertion
  // would pass even if the click did nothing.
  if (expected > 0) {
    // VoucherSheet.tsx only renders this heading once `personalVouchers` has
    // resolved and is non-empty, so it proves the sheet actually opened and
    // loaded, not just that the trigger row exists.
    await expect(page.getByText('Voucher giới thiệu của tôi')).toBeVisible()
  } else {
    // With zero personal vouchers, VoucherSheet renders no personal-section
    // markup at all (and the seeded public vouchers keep the "no vouchers"
    // empty state from rendering too), so there's nothing populated to anchor
    // on. Anchor on the sheet being open instead: its own header repeats the
    // trigger's exact text, so two matches only exist once the sheet has
    // actually rendered — one match means it's still closed.
    await expect(page.getByText('Voucher của tôi')).toHaveCount(2)
  }
  await expect.poll(() => page.getByText(/^REF-/).count()).toBe(expected)
  return expected
}
