import { test, expect, type Page } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

async function openFreeTab(page: Page, phone: string) {
  await loginExisting(page, APP.driver, phone)
  // DB dev mới chưa có bản ghi đồng ý Điều khoản → cổng TermsGate chặn app; đồng ý nếu nó hiện.
  const agree = page.getByRole('button', { name: 'Đồng ý', exact: true })
  await expect(page.getByRole('link', { name: 'Free' }).or(agree)).toBeVisible()
  if (await agree.isVisible()) {
    await page.locator('input[type="checkbox"]').check()
    await agree.click()
  }
  await page.getByRole('link', { name: 'Free' }).click()
}

async function postRide(page: Page, text: string) {
  await page.getByTestId('free-ride-compose').fill(text)
  await page.getByTestId('free-ride-send').click()
  // Lần đầu đăng: server trả 409 → popup Quy định đăng cuốc. isVisible() không chờ, nên chờ một trong hai.
  const terms = page.getByTestId('ride-post-terms')
  const card = page.getByTestId('free-ride-card').filter({ hasText: text.split(' ')[2] })
  await expect(card.or(terms)).toBeVisible()
  if (await terms.isVisible()) {
    await page.getByRole('button', { name: 'Đồng ý và đăng cuốc' }).click()
  }
}

// Đăng cuốc như gửi tin Zalo: gõ → Gửi → (quy định lần đầu) → thẻ "Cuốc của bạn" hiện ngay. Dev không có
// OPENAI_API_KEY thì AI tách thất bại, cuốc vẫn hiện nguyên văn (đúng thiết kế) — test không phụ thuộc AI.
test('tài xế gõ tin rồi Gửi, cuốc hiện ngay và Đã có xe gỡ được', async ({ page }) => {
  const tag = Date.now().toString(36)
  await loginExisting(page, APP.driver, SEEDED.driver)
  const agree = page.getByRole('button', { name: 'Đồng ý', exact: true })
  await expect(page.getByRole('link', { name: 'Free' }).or(agree)).toBeVisible()
  if (await agree.isVisible()) {
    await page.locator('input[type="checkbox"]').check()
    await agree.click()
  }
  await page.getByRole('link', { name: 'Free' }).click()

  await page.getByTestId('free-ride-compose').fill(`Tiễn Mỹ Đình ${tag} 15h xe 5 250k lh 0912 345 678`)
  await page.getByTestId('free-ride-send').click()
  // Lần đầu đăng: server trả 409 → popup Quy định đăng cuốc. isVisible() không chờ, nên chờ một trong hai.
  const terms = page.getByTestId('ride-post-terms')
  const card = page.getByTestId('free-ride-card').filter({ hasText: tag })
  await expect(card.or(terms)).toBeVisible()
  if (await terms.isVisible()) {
    await page.getByRole('button', { name: 'Đồng ý và đăng cuốc' }).click()
  }

  await expect(card).toContainText('Cuốc của bạn')
  await expect(card).not.toContainText('0912 345 678')
  await expect(page.getByTestId('free-ride-compose')).toHaveValue('')

  await card.getByTestId('own-ride-close').click()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toHaveCount(0)

  await page.getByTestId('my-rides-link').click()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toBeVisible()
  await expect(page.getByTestId('my-ride-status').first()).toHaveText('Đã có xe')
})

// Người đăng tắt nút Zalo: tài xế đã mở khoá chỉ thấy nút Gọi tới số tài khoản người đăng. Tài xế khoá vẫn
// đăng được cuốc (khoá chỉ áp lên việc xem liên hệ).
test('người đăng tắt Zalo thì tài xế khác chỉ thấy nút Gọi', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await openFreeTab(page, SEEDED.lockedDriver)
  await page.getByTestId('free-ride-zalo-toggle').uncheck()
  await postRide(page, `Tiễn Gọi ${tag} 16h`)
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toContainText('Cuốc của bạn')

  const viewer = await (await browser.newContext()).newPage()
  await openFreeTab(viewer, SEEDED.driver)
  const card = viewer.getByTestId('free-ride-card').filter({ hasText: tag })
  await expect(card.getByTestId('free-ride-call')).toHaveAttribute('href', `tel:${SEEDED.lockedDriver}`)
  await expect(card.getByTestId('free-ride-zalo')).toHaveCount(0)

  // Dọn: bật lại Zalo cho lần đăng sau của tài xế này.
  await page.getByTestId('free-ride-zalo-toggle').check()
})

// Backend cũ (chưa có trường contact) trong lúc phát hành lệch nhau: tab Free không được sập.
test('API thiếu trường contact thì thẻ cuốc vẫn hiện', async ({ page }) => {
  await page.route(/\/api\/driver\/free-rides(\?.*)?$/, async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    for (const ride of body.data as Record<string, unknown>[]) delete ride.contact
    await route.fulfill({ response: res, json: body })
  })
  await openFreeTab(page, SEEDED.driver)
  await expect(page.getByTestId('free-ride-card').first()).toBeVisible()
})
