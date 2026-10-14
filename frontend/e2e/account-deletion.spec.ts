import { test, expect } from '@playwright/test'
import { APP, TEST_PASSWORD, randomPhone } from './fixtures/testData'
import { registerCustomer } from './fixtures/auth'

test.describe('Xoá tài khoản', () => {
  test('khách tự xoá tài khoản → về màn đăng nhập, không đăng nhập lại được', async ({ page }) => {
    const phone = randomPhone()
    await registerCustomer(page, phone)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    const del = page.getByRole('button', { name: 'Xoá vĩnh viễn' })
    await expect(del).toBeDisabled()

    await page.getByLabel('Nhập mã PIN để xác nhận').fill('111111')
    await del.click()
    await expect(page.getByText('Mã PIN không đúng.')).toBeVisible()

    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    await del.click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Tài khoản của bạn đã được xoá')).toBeVisible()
  })

  // Tài xế/khách đang bật push: sau khi xoá không được gọi lại API (token đã bị xoá → 401 →
  // axios tải lại trang về /login, mất toast) và subscription trên máy phải được huỷ.
  test('đang bật push → vẫn thấy toast, subscription trên máy được huỷ', async ({ page }) => {
    await page.addInitScript(() => {
      const w = globalThis as unknown as { __unsubscribed?: boolean }
      const sub = { endpoint: 'https://push.example/e2e', unsubscribe: async () => { w.__unsubscribed = true; return true } }
      const reg = { pushManager: { getSubscription: async () => sub }, update: async () => {} }
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          ready: Promise.resolve(reg), controller: null,
          register: async () => reg, addEventListener: () => {}, getRegistration: async () => reg,
        },
      })
    })
    const phone = randomPhone()
    await registerCustomer(page, phone)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Xoá vĩnh viễn' }).click()

    await expect(page.getByText('Tài khoản của bạn đã được xoá')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __unsubscribed?: boolean }).__unsubscribed)).toBe(true)
  })
})
