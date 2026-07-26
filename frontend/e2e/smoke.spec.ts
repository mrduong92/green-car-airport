import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { loginExisting, registerCustomer } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import { createBooking, readDriverWalletPoints } from './fixtures/flows'

// The booking form is unreachable for a customer who already has an active
// booking: BookingFormPage.tsx:252-256 redirects any non-collaborator with one
// to its status page. The seeded customer 0901234567 owns a seeded `accepted`
// booking, so bookings must be placed by a freshly registered customer.
test('khách hàng mới đăng ký và đặt được chuyến', async ({ page }) => {
  await stubGoong(page)
  await registerCustomer(page, randomPhone())

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
