import { test, expect, devices } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { pushFreeRides } from './fixtures/freeRides'

// Giai đoạn 2 chỉ gửi sang Laravel cuốc có qr_code hợp lệ (cột NOT NULL) — không còn
// trạng thái "Chưa liên hệ được", nên mọi cuốc fixture đẩy lên đều có qrCode.
// "Ẩn người bắn" khoá theo mã QR hồ sơ (mọi uid cùng mã) và tài xế seed dùng chung giữa các lần
// chạy — mã QR phải gắn tag theo lần chạy, nếu dùng mã cố định thì lần chạy sau cuốc đã bị ẩn sẵn.
test('tài xế thấy cuốc Free, nút Nhận cuốc mở Zalo, ẩn được người bắn', async ({ page }) => {
  const tag = Date.now().toString(36)
  const qrCode = `e2ea${tag}`
  await pushFreeRides([
    { pickup: `Điểm có mã ${tag}`, senderUid: `e2e-a-${tag}`, qrCode },
  ])

  await loginExisting(page, APP.driver, SEEDED.driver)
  await expect(page).toHaveURL(/\/driver\/trips/)
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page).toHaveURL(/\/driver\/free/)

  const withCode = page.getByTestId('free-ride-card').filter({ hasText: `Điểm có mã ${tag}` })
  await expect(withCode).toBeVisible()
  await expect(withCode.getByTestId('free-ride-accept')).toHaveAttribute('href', `zalo://qr/p/${qrCode}`)

  // Cuốc mới tới khi đang mở trang → hiện ra không cần tải lại (tín hiệu realtime + since, rải ≤ 3 giây)
  await pushFreeRides([{ pickup: `Điểm realtime ${tag}`, senderUid: `e2e-c-${tag}`, qrCode: `e2ec${tag}` }])
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

test('xoá chữ tìm kiếm bằng nút ✕ và "Xoá lọc" đưa bộ lọc về mặc định', async ({ page }) => {
  const tag = Date.now().toString(36)
  await pushFreeRides([{ pickup: `Điểm lọc ${tag}`, senderUid: `e2e-f-${tag}`, qrCode: `e2ef${tag}` }])
  await loginExisting(page, APP.driver, SEEDED.driver)
  await page.getByRole('link', { name: 'Free' }).click()
  const card = page.getByTestId('free-ride-card').filter({ hasText: `Điểm lọc ${tag}` })
  await expect(card).toBeVisible()

  const search = page.getByTestId('free-search')
  await expect(page.getByTestId('free-search-clear')).toHaveCount(0)
  await search.fill('không-có-địa-điểm-này')
  await expect(card).toHaveCount(0)
  await page.getByTestId('free-search-clear').click()
  await expect(search).toHaveValue('')
  await expect(card).toBeVisible()

  await expect(page.getByTestId('free-filters-reset')).toHaveCount(0)
  await page.getByRole('button', { name: 'Đón sân bay' }).click()
  await page.getByRole('button', { name: 'Ngày mai' }).click()
  await search.fill('xyz')
  await page.getByTestId('free-filters-reset').click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Tất cả' })).toHaveClass(/bg-primary/)
  await expect(page.getByRole('button', { name: 'Mọi giờ' })).toHaveClass(/bg-primary/)
  await expect(page.getByTestId('free-filters-reset')).toHaveCount(0)
  await expect(card).toBeVisible()
})

// Zalo Android chỉ nhận scheme zalo:// với host zaloapp.com — zalo://qr/p/<mã> (host "qr", iOS mở
// được) bấm trên Android không mở gì. Dùng đúng intent mà trang zaloapp.com/qr/p/… tự dùng trên Android.
test.describe('Android', () => {
  const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7']
  test.use(pixel)

  test('nút Nhận cuốc dùng intent Zalo Android, có link web dự phòng', async ({ page }) => {
    const tag = Date.now().toString(36)
    const qrCode = `e2ed${tag}`
    await pushFreeRides([{ pickup: `Điểm Android ${tag}`, senderUid: `e2e-d-${tag}`, qrCode }])
    await loginExisting(page, APP.driver, SEEDED.driver)
    await page.getByRole('link', { name: 'Free' }).click()
    const card = page.getByTestId('free-ride-card').filter({ hasText: `Điểm Android ${tag}` })
    await expect(card.getByTestId('free-ride-accept')).toHaveAttribute('href',
      `intent://zaloapp.com/qr/p/${qrCode}#Intent;scheme=zalo;action=android.intent.action.VIEW;`
      + `category=android.intent.category.BROWSABLE;package=com.zing.zalo;`
      + `S.browser_fallback_url=${encodeURIComponent(`https://zaloapp.com/qr/p/${qrCode}`)};end`)
  })
})
