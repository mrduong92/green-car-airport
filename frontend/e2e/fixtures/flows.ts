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
  // pre-load "0" placeholder. Waiting for the /driver/wallet response isn't
  // enough either — React still needs a tick to process it and re-render —
  // so we also wait for the network to go quiet before reading the DOM.
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/driver/wallet'),
    page.goto(`${APP.driver}/driver/wallet`),
  ])
  await page.waitForLoadState('networkidle')
  const label = page.getByText('Số dư điểm')
  await expect(label).toBeVisible()
  const value = await label.locator('xpath=following-sibling::p[1]').textContent()
  return parseVnNumber(value ?? '0')
}

/** Reads the collaborator wallet point balance on the customer app. */
export async function readCollaboratorWalletPoints(page: Page): Promise<number> {
  // Same static-label-vs-async-data race as readDriverWalletPoints.
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/customer/collaborator/wallet'),
    page.goto(`${APP.customer}/customer/collaborator/wallet`),
  ])
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Ví Cộng Tác Viên')).toBeVisible()
  const value = await page.getByText(/\d+\s*điểm/).first().textContent()
  return parseVnNumber(value ?? '0')
}

/** Counts the customer's personal (referral) vouchers in the Profile voucher sheet. */
export async function countPersonalVouchers(page: Page): Promise<number> {
  await page.goto(`${APP.customer}/customer/profile`)
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/customer/my-vouchers'),
    page.getByText('Voucher của tôi').click(),
  ])
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Voucher của tôi').last()).toBeVisible()
  return await page.getByText(/^REF-/).count()
}
