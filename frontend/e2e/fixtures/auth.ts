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
    // Assert before filling the next box — this forces a round-trip that
    // lets React commit the re-render. Without it, a stale-closure race in
    // the app's OTP handler (`const next = [...otp]` closes over the
    // pre-commit array) can silently drop the digit just written when
    // boxes are filled back-to-back faster than React can re-render.
    await expect(boxes.nth(i)).toHaveValue(TEST_OTP[i])
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
