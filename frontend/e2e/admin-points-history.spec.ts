import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

// Nút "Lịch sử điểm" ở trang Tài xế hiện TOÀN BỘ giao dịch điểm (phí app, thu hộ, hoàn…),
// không chỉ lần admin điều chỉnh — và lọc được theo nhóm.
test('admin xem lịch sử điểm tài xế gồm cả phí app và lọc theo nhóm', async ({ page }) => {
  await loginExisting(page, APP.admin, SEEDED.admin)
  await expect(page).toHaveURL(/\/dashboard/)
  await page.goto(`${APP.admin}/drivers`)

  await page.getByPlaceholder(/Tìm/).first().fill(SEEDED.driver)
  const card = page.locator('div').filter({ hasText: SEEDED.driver }).filter({ has: page.getByRole('button', { name: 'Lịch sử điểm' }) }).last()
  await card.getByRole('button', { name: 'Lịch sử điểm' }).click()

  const dialog = page.locator('div.fixed.inset-0')
  for (const name of ['Tất cả', 'Nạp', 'Trừ theo cuốc', 'Hoàn', 'Admin điều chỉnh']) {
    await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(dialog.getByText(/^Phí app · Cuốc #\d+/).first()).toBeVisible()

  // Dữ liệu seed không có dòng nạp qua cổng → lọc "Nạp" loại hết dòng phí app.
  await dialog.getByRole('button', { name: 'Nạp', exact: true }).click()
  await expect(dialog.getByText('Chưa có giao dịch điểm nào')).toBeVisible()
  await expect(dialog.getByText(/^Phí app/)).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Trừ theo cuốc', exact: true }).click()
  await expect(dialog.getByText(/^Phí app · Cuốc #\d+/).first()).toBeVisible()
})
