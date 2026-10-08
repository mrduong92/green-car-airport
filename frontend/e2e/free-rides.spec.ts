import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { pushFreeRides } from './fixtures/freeRides'

// Giai đoạn 2 chỉ gửi sang Laravel cuốc có qr_code hợp lệ (cột NOT NULL) — không còn
// trạng thái "Chưa liên hệ được", nên mọi cuốc fixture đẩy lên đều có qrCode.
test('tài xế thấy cuốc Free, nút Nhận cuốc mở Zalo, ẩn được người bắn', async ({ page }) => {
  const tag = Date.now().toString(36)
  await pushFreeRides([
    { pickup: `Điểm có mã ${tag}`, senderUid: `e2e-a-${tag}`, qrCode: 'e2etestcode123' },
  ])

  await loginExisting(page, APP.driver, SEEDED.driver)
  await expect(page).toHaveURL(/\/driver\/trips/)
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page).toHaveURL(/\/driver\/free/)

  const withCode = page.getByTestId('free-ride-card').filter({ hasText: `Điểm có mã ${tag}` })
  await expect(withCode).toBeVisible()
  await expect(withCode.getByTestId('free-ride-accept')).toHaveAttribute('href', 'zalo://qr/p/e2etestcode123')

  // Cuốc mới tới khi đang mở trang → hiện ra không cần tải lại (tín hiệu realtime + since, rải ≤ 3 giây)
  await pushFreeRides([{ pickup: `Điểm realtime ${tag}`, senderUid: `e2e-c-${tag}`, qrCode: 'e2erealtime' }])
  const realtimeCard = page.getByTestId('free-ride-card').filter({ hasText: `Điểm realtime ${tag}` })
  await expect(realtimeCard).toBeVisible({ timeout: 15_000 })

  // Ẩn người bắn → ConfirmDialog hỏi trước, xác nhận mới gọi API; biến mất ngay,
  // tải lại trang vẫn không thấy, nhưng cuốc của người bắn khác vẫn còn.
  await withCode.getByTestId('free-ride-more').click()
  await page.getByTestId('free-ride-hide-sender').click()
  await page.getByRole('button', { name: 'Ẩn', exact: true }).click()
  await expect(withCode).toHaveCount(0)
  await page.reload()
  await expect(realtimeCard).toBeVisible()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: `Điểm có mã ${tag}` })).toHaveCount(0)
})
