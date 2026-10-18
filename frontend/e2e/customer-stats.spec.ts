import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

function fmtDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

test('khách lọc Thống kê theo khoảng ngày, đổi kiểu gom, thấy 3 biểu đồ và 5 KPI', async ({ page }) => {
  await loginExisting(page, APP.customer, SEEDED.customer)
  await expect(page).toHaveURL(/\/customer\/booking/)
  await page.goto(`${APP.customer}/customer/stats`)

  await expect(page.getByTestId('stats-chart-spent')).toBeVisible()
  await expect(page.getByTestId('stats-chart-trips')).toBeVisible()
  await expect(page.getByTestId('stats-chart-points')).toBeVisible()
  await expect(page.getByTestId('stats-kpi-reward')).toBeVisible()
  await expect(page.getByTestId('stats-kpi-saved')).toBeVisible()
  // Mặc định "Tháng này" đang được chọn.
  await expect(page.getByTestId('stats-preset-this_month')).toHaveClass(/bg-primary/)

  const now = new Date()
  const first = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const last = fmtDate(new Date(now.getFullYear(), now.getMonth(), 0))
  await page.getByTestId('stats-preset-last_month').click()
  await expect(page).toHaveURL(new RegExp(`from=${first}&to=${last}`))

  await page.getByTestId('stats-group-week').click()
  await expect(page).toHaveURL(/group=week/)

  await expect(page.getByTestId('stats-chart-spent')).toBeVisible()
  await expect(page.getByTestId('stats-chart-trips')).toBeVisible()
  await expect(page.getByTestId('stats-chart-points')).toBeVisible()
})

test('khách thấy trạng thái lỗi + nút Thử lại khi Thống kê tải thất bại', async ({ page }) => {
  await page.route('**/api/customer/stats**', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server error' }),
  }))
  await loginExisting(page, APP.customer, SEEDED.customer)
  await expect(page).toHaveURL(/\/customer\/booking/)
  await page.goto(`${APP.customer}/customer/stats`)

  await expect(page.getByText('Không tải được thống kê')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
})
