import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

// Giai đoạn 5: sheet "Báo khi có cuốc phù hợp" ở tab Free. Lưu lại ĐÚNG bộ lọc đang chọn (chiều,
// số chỗ, từ khoá) làm tiêu chí nhận thông báo đẩy — không có form lọc riêng trong sheet.
//
// Không cấp quyền notifications cho context Playwright và không giả lập Push API thật:
// FreeRideAlertSheet cố tình KHÔNG chặn việc lưu bộ lọc khi xin quyền/đăng ký push thất bại hoặc bị
// từ chối (xem component — quyết định ghi trong JSDoc của nó), nên việc lưu + đọc lại bộ lọc không
// phụ thuộc vào quyền thông báo thật của trình duyệt. Test này xác nhận đúng phần đó: bộ lọc + trạng
// thái bật/tắt được ghi xuống server và còn nguyên sau khi tải lại trang.
test('tài xế lưu cảnh báo cuốc phù hợp theo bộ lọc đang chọn, còn nguyên sau khi tải lại', async ({ page }) => {
  const tag = Date.now().toString(36)
  const keyword = `khu ${tag}`

  await loginExisting(page, APP.driver, SEEDED.driver)
  await expect(page).toHaveURL(/\/driver\/trips/)
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page).toHaveURL(/\/driver\/free/)

  // Chọn bộ lọc trên tab Free trước — sheet phải dùng đúng các giá trị này làm tiêu chí lưu.
  // Số chỗ nằm sau toggle "Lọc thêm" (giai đoạn 4 gộp bớt chip hiện mặc định).
  await page.getByRole('button', { name: 'Tiễn sân bay' }).click()
  await page.getByTestId('free-filters-more-toggle').click()
  await page.getByRole('button', { name: '4 chỗ' }).click()
  const search = page.getByPlaceholder('Tìm địa điểm (vd: Hà Đông, T2...)')
  await search.fill(keyword)
  await expect(search).toHaveValue(keyword)
  // FreeRideFilters debounce 400ms trước khi báo filters.q mới lên FreeRidesPage.
  await page.waitForTimeout(600)

  await page.getByTestId('free-alert-open').click()
  const sheet = page.getByTestId('free-alert-sheet')
  await expect(sheet).toBeVisible()
  // Sheet tóm tắt đúng bộ lọc đang chọn + nói rõ từ khoá khớp nguyên cụm (không tách rời từng chữ).
  await expect(sheet.getByText('Tiễn sân bay')).toBeVisible()
  await expect(sheet.getByText('4 chỗ')).toBeVisible()
  await expect(sheet.getByText(keyword)).toBeVisible()
  await expect(sheet.getByText('tìm đúng cụm từ', { exact: false })).toBeVisible()

  const toggle = page.getByTestId('free-alert-toggle')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  const [saveResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/driver/free-rides/alert') && r.request().method() === 'PUT'),
    page.getByTestId('free-alert-save').click(),
  ])
  expect(saveResp.ok()).toBeTruthy()
  await expect(sheet).toHaveCount(0)

  const bell = page.getByTestId('free-alert-open')
  await expect(bell).toContainText('Đang báo')
  await expect(bell).toContainText('Tiễn sân bay')
  await expect(bell).toContainText('4 chỗ')
  await expect(bell).toContainText(keyword)

  // Tải lại trang: trạng thái phải đọc lại được từ server (GET /driver/free-rides/alert), không
  // chỉ là state React còn giữ trong phiên cũ.
  await page.reload()
  await expect(bell).toContainText('Đang báo')
  await expect(bell).toContainText('Tiễn sân bay')
  await expect(bell).toContainText('4 chỗ')
  await expect(bell).toContainText(keyword)

  // Dọn lại: tắt cảnh báo để không để lại trạng thái "đang bật" cho driver seed dùng chung giữa
  // các lần chạy / các spec khác (hàng alert là 1-1 theo driver_id, updateOrCreate).
  await bell.click()
  const toggleAfterReload = page.getByTestId('free-alert-toggle')
  await expect(toggleAfterReload).toHaveAttribute('aria-checked', 'true')
  await toggleAfterReload.click()
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/driver/free-rides/alert') && r.request().method() === 'PUT'),
    page.getByTestId('free-alert-save').click(),
  ])
  await expect(bell).not.toContainText('Đang báo')
})
