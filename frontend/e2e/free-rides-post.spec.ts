import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

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
