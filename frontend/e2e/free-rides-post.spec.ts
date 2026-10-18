import { test, expect, type Page } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

async function login(page: Page, phone: string) {
  await loginExisting(page, APP.driver, phone)
  // DB dev mới chưa có bản ghi đồng ý Điều khoản → cổng TermsGate chặn app; đồng ý nếu nó hiện.
  const agree = page.getByRole('button', { name: 'Đồng ý', exact: true })
  await expect(page.getByRole('link', { name: 'Free' }).or(agree)).toBeVisible()
  if (await agree.isVisible()) {
    await page.locator('input[type="checkbox"]').check()
    await agree.click()
  }
}

// Nút (+) to ở giữa thanh menu mở màn đăng cuốc kiểu khung chat Zalo.
async function openComposer(page: Page, phone: string) {
  await login(page, phone)
  await page.getByTestId('nav-post-ride').click()
  await expect(page).toHaveURL(/\/driver\/free\/create$/)
}

async function postRide(page: Page, text: string, tag: string) {
  await page.getByTestId('free-ride-compose').fill(text)
  await page.getByTestId('free-ride-send').click()
  // Lần đầu đăng: server trả 409 → popup Quy định đăng cuốc. isVisible() không chờ, nên chờ một trong hai.
  const terms = page.getByTestId('ride-post-terms')
  const bubble = page.getByTestId('my-ride-bubble').filter({ hasText: tag })
  await expect(bubble.or(terms)).toBeVisible()
  if (await terms.isVisible()) {
    await page.getByRole('button', { name: 'Đồng ý và đăng cuốc' }).click()
  }
  await expect(bubble).toBeVisible()
  return bubble
}

// Đăng cuốc như gửi tin Zalo: gõ → Gửi → (quy định lần đầu) → bong bóng tin hiện ngay trong luồng chat.
// Test không phụ thuộc AI tách cuốc (thiếu OPENAI_API_KEY thì cuốc vẫn hiện nguyên văn).
test('tài xế gõ tin rồi Gửi, cuốc hiện ngay và Đã có xe gỡ được', async ({ page }) => {
  const tag = Date.now().toString(36)
  await openComposer(page, SEEDED.driver)

  // Màn đăng cuốc ẩn thanh menu như màn chat Zalo.
  await expect(page.getByTestId('nav-post-ride')).toHaveCount(0)
  const bubble = await postRide(page, `Tiễn Mỹ Đình ${tag} 15h xe 5 250k lh 0912 345 678`, tag)
  await expect(bubble).not.toContainText('0912 345 678')
  await expect(page.getByTestId('free-ride-compose')).toHaveValue('')

  // Chip trả lời nhanh chèn chữ vào ô soạn tin.
  await page.getByTestId('quick-chip').filter({ hasText: 'Xe 7 chỗ' }).click()
  await expect(page.getByTestId('free-ride-compose')).toHaveValue('Xe 7 chỗ')
  await page.getByTestId('free-ride-compose').fill('')

  // Bấm vào bong bóng hiện thao tác; Đã có xe đổi trạng thái ngay trong luồng.
  await bubble.click()
  await page.getByTestId('own-ride-close').click()
  await expect(page.getByTestId('my-ride-row').filter({ hasText: tag }).getByTestId('my-ride-status')).toContainText('Đã có xe')

  // Tab Free không còn cuốc đó, cũng không còn ô soạn tin.
  await page.goBack()
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page).toHaveURL(/\/driver\/free$/)
  await expect(page.getByTestId('free-ride-compose')).toHaveCount(0)
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toHaveCount(0)

  // "Cuốc tôi đăng" nằm ở Hồ sơ.
  await page.goto(`${APP.driver}/driver/profile`)
  await page.getByTestId('my-rides-link').click()
  await expect(page).toHaveURL(/\/driver\/free\/mine$/)
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toBeVisible()
})

// Người đăng tắt nút Zalo: tài xế đã mở khoá chỉ thấy nút Gọi tới số tài khoản người đăng. Tài xế khoá vẫn
// đăng được cuốc (khoá chỉ áp lên việc xem liên hệ).
test('người đăng tắt Zalo thì tài xế khác chỉ thấy nút Gọi', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await openComposer(page, SEEDED.lockedDriver)
  const toggle = page.getByTestId('free-ride-zalo-toggle')
  if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await postRide(page, `Tiễn Gọi ${tag} 16h`, tag)

  const viewer = await (await browser.newContext()).newPage()
  await login(viewer, SEEDED.driver)
  await viewer.getByRole('link', { name: 'Free' }).click()
  const card = viewer.getByTestId('free-ride-card').filter({ hasText: tag })
  await expect(card.getByTestId('free-ride-call')).toHaveAttribute('href', `tel:${SEEDED.lockedDriver}`)
  await expect(card.getByTestId('free-ride-zalo')).toHaveCount(0)

  // Dọn: bật lại Zalo cho lần đăng sau của tài xế này.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
})

// Backend cũ (chưa có trường contact) trong lúc phát hành lệch nhau: tab Free không được sập.
test('API thiếu trường contact thì thẻ cuốc vẫn hiện', async ({ page }) => {
  await page.route(/\/api\/driver\/free-rides(\?.*)?$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const ride of body.data as Record<string, unknown>[]) delete ride.contact
    await route.fulfill({ response: res, json: body })
  })
  await login(page, SEEDED.driver)
  await page.getByRole('link', { name: 'Free' }).click()
  await expect(page.getByTestId('free-ride-card').first()).toBeVisible()
})
