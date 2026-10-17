import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { pushFreeRides } from './fixtures/freeRides'

// Tài xế chưa mở khóa vẫn thấy cuốc nhưng không có nút Nhận cuốc — bấm thì xin admin mở khoá; admin mở khóa thì có.
test('tài xế khóa xin mở khoá, admin mở khóa xong thì Nhận cuốc dùng được', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  const qrCode = `e2el${tag}`
  await pushFreeRides([{ pickup: `Điểm khóa ${tag}`, senderUid: `e2e-l-${tag}`, qrCode }])

  await loginExisting(page, APP.driver, SEEDED.lockedDriver)
  // DB dev mới chưa có bản ghi đồng ý Điều khoản → cổng TermsGate chặn app; đồng ý nếu nó hiện.
  const agree = page.getByRole('button', { name: 'Đồng ý', exact: true })
  await expect(page.getByRole('link', { name: 'Free' }).or(agree)).toBeVisible()
  if (await agree.isVisible()) {
    await page.locator('input[type="checkbox"]').check()
    await agree.click()
  }
  await expect(page).toHaveURL(/\/driver\/trips/)
  await page.getByRole('link', { name: 'Free' }).click()

  const card = page.getByTestId('free-ride-card').filter({ hasText: `Điểm khóa ${tag}` })
  await expect(card).toBeVisible()
  await expect(card.getByTestId('free-ride-accept')).toHaveCount(0)
  // Popup xin mở khoá (thay QR 300k): gửi yêu cầu → hiện "Đã gửi yêu cầu".
  await expect(card.getByTestId('free-ride-locked')).toContainText('Mở khoá liên hệ')
  await card.getByTestId('free-ride-locked').click()
  await expect(page.getByTestId('free-unlock-sheet')).toBeVisible()
  await page.getByTestId('free-unlock-request').click()
  await expect(page.getByTestId('free-unlock-sheet')).toHaveCount(0)
  await card.getByTestId('free-ride-locked').click()
  await expect(page.getByTestId('free-unlock-requested')).toBeVisible()
  await page.getByRole('button', { name: 'Đóng' }).click()

  // Khóa ở server: gọi thẳng API bằng token của tài xế khóa vẫn không lấy được mã QR.
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const api = process.env.E2E_API ?? 'http://localhost:8080'
  const res = await page.request.get(`${api}/api/driver/free-rides`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  expect(await res.text()).not.toContain(qrCode)

  // Admin mở khóa → tài xế mở lại tab Free thấy nút Nhận cuốc.
  const adminPage = await (await browser.newContext()).newPage()
  await loginExisting(adminPage, APP.admin, SEEDED.admin)
  await expect(adminPage).toHaveURL(/\/dashboard/)
  await adminPage.goto(`${APP.admin}/drivers`)
  await adminPage.getByPlaceholder('Tìm theo tên, SĐT, biển số').fill(SEEDED.lockedDriver)
  await expect(adminPage.getByText(SEEDED.lockedDriver)).toBeVisible()
  await adminPage.getByRole('button', { name: 'Mở khóa Free' }).first().click()
  // Thao tác liên quan tiền: phải qua hộp xác nhận (có ngày hết hạn mới), bấm nhầm không mở khóa.
  await expect(adminPage.getByText('Mở khóa Nhận cuốc Free?')).toBeVisible()
  await adminPage.getByRole('button', { name: 'Mở khóa 1 năm' }).click()
  await expect(adminPage.getByRole('button', { name: 'Gia hạn Free' }).first()).toBeVisible()

  try {
    await page.reload()
    await expect(page.getByTestId('free-ride-card').filter({ hasText: `Điểm khóa ${tag}` }).getByTestId('free-ride-accept'))
      .toHaveAttribute('href', `zalo://qr/p/${qrCode}`)
  } finally {
    // Dọn: thu hồi để lần chạy sau lại bắt đầu ở trạng thái khóa — kể cả khi assert ở trên fail.
    await adminPage.getByRole('button', { name: 'Thu hồi Free' }).first().click()
    await expect(adminPage.getByText('Thu hồi khóa Nhận cuốc Free?')).toBeVisible()
    await adminPage.getByRole('button', { name: 'Thu hồi', exact: true }).click()
    await expect(adminPage.getByRole('button', { name: 'Mở khóa Free' }).first()).toBeVisible()
  }
})
