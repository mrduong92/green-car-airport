import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

// Nhân viên nạp điểm thủ công tìm tài xế theo mã (= nội dung chuyển khoản, vd GCA000123).
test('admin tìm tài xế theo mã tài xế', async ({ page }) => {
  await loginExisting(page, APP.admin, SEEDED.admin)
  await expect(page).not.toHaveURL(/login/, { timeout: 20000 })
  await page.goto(`${APP.admin}/drivers`)

  const search = page.getByPlaceholder('Tìm theo tên, SĐT, biển số, mã tài xế')
  await search.fill(SEEDED.driver)
  const code = (await page.getByTestId('driver-payment-code').first().textContent())?.trim() ?? ''
  expect(code).toMatch(/^[A-Z]+\d{6}$/)

  await search.fill(code.slice(-6))
  await expect(page.getByText(SEEDED.driver)).toBeVisible()
  await expect(page.getByTestId('driver-payment-code').first()).toHaveText(code)
})
