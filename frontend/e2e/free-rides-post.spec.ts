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

// Đăng xong tự chuyển về tab Free, cuốc mới nằm đầu danh sách.
async function postRide(page: Page, text: string, tag: string) {
  await page.getByTestId('free-ride-compose').fill(text)
  await page.getByTestId('free-ride-send').click()
  // Lần đầu đăng: server trả 409 → popup Quy định đăng cuốc. isVisible() không chờ, nên chờ một trong hai.
  const terms = page.getByTestId('ride-post-terms')
  const card = page.getByTestId('free-ride-card').filter({ hasText: tag })
  await expect(card.or(terms)).toBeVisible()
  if (await terms.isVisible()) {
    await page.getByRole('button', { name: 'Đồng ý và đăng cuốc' }).click()
  }
  await expect(page).toHaveURL(/\/driver\/free$/)
  await expect(card).toContainText('Cuốc của bạn')
  return card
}

// Màn đăng cuốc là form: ô nhập tin to ở đầu (focus sẵn), công tắc Zalo, nút Đăng cuốc.
// Test không phụ thuộc AI tách cuốc (thiếu credit/key OpenAI thì cuốc vẫn hiện nguyên văn).
test('tài xế gõ tin rồi Đăng cuốc, về tab Free thấy cuốc và Đã có xe gỡ được', async ({ page }) => {
  const tag = Date.now().toString(36)
  await openComposer(page, SEEDED.driver)

  // Ô nhập tin là thứ đầu tiên, con trỏ ở sẵn trong ô; thanh menu ẩn.
  await expect(page.getByTestId('free-ride-compose')).toBeFocused()
  await expect(page.getByTestId('nav-post-ride')).toHaveCount(0)
  await expect(page.getByTestId('free-ride-send')).toBeDisabled()

  const card = await postRide(page, `Tiễn Mỹ Đình ${tag} 15h xe 5 250k lh 0912 345 678`, tag)
  await expect(card).not.toContainText('0912 345 678')

  await card.getByTestId('own-ride-close').click()
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toHaveCount(0)

  // "Cuốc tôi đăng" nằm ở Hồ sơ.
  await page.goto(`${APP.driver}/driver/profile`)
  await page.getByTestId('my-rides-link').click()
  await expect(page).toHaveURL(/\/driver\/free\/mine$/)
  await expect(page.getByTestId('free-ride-card').filter({ hasText: tag })).toBeVisible()
})

// Người đăng tắt nút Zalo: tài xế đã mở khoá chỉ thấy nút Gọi tới số tài khoản người đăng. Tài xế khoá vẫn
// đăng được cuốc (khoá chỉ áp lên việc xem liên hệ).
test('người đăng tắt Zalo thì chỉ có nút Gọi, bật thì có nút Zalo', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  await openComposer(page, SEEDED.lockedDriver)
  const toggle = page.getByTestId('free-ride-zalo-toggle')
  if ((await toggle.getAttribute('aria-checked')) === 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await postRide(page, `Tiễn Gọi ${tag} 16h`, tag)

  // Bật lại Zalo (ghi nhớ cho lần sau) rồi đăng cuốc thứ hai.
  await page.getByTestId('nav-post-ride').click()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await postRide(page, `Tiễn Nhắn ${tag} 17h`, `Nhắn ${tag}`)

  const viewer = await (await browser.newContext()).newPage()
  await login(viewer, SEEDED.driver)
  await viewer.getByRole('link', { name: 'Free' }).click()
  const callOnly = viewer.getByTestId('free-ride-card').filter({ hasText: `Gọi ${tag}` })
  await expect(callOnly.getByTestId('free-ride-call')).toHaveAttribute('href', `tel:${SEEDED.lockedDriver}`)
  await expect(callOnly.getByTestId('free-ride-zalo')).toHaveCount(0)
  const withZalo = viewer.getByTestId('free-ride-card').filter({ hasText: `Nhắn ${tag}` })
  await expect(withZalo.getByTestId('free-ride-zalo')).toHaveAttribute('href', /zalo\.me\//)

  // Cuốc tài xế đăng không có link hồ sơ Zalo → menu "…" không có mục báo link hỏng.
  await withZalo.getByTestId('free-ride-more').click()
  await expect(viewer.getByTestId('free-ride-hide-sender')).toBeVisible()
  await expect(viewer.getByText('Nút Nhận cuốc mở sai trang')).toHaveCount(0)
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
