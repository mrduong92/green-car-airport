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
    // loginExisting does not wait for navigation to settle — assert the
    // post-login redirect landed before doing anything else on this page.
    await expect(customerC).toHaveURL(/\/customer\/booking/)
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
    await expect(driver).toHaveURL(/\/driver\/trips/)
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
