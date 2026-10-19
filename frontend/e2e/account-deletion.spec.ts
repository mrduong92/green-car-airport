import { test, expect } from '@playwright/test'
import { APP, SEEDED, TEST_PASSWORD, randomPhone } from './fixtures/testData'
import { loginExisting, registerCustomer } from './fixtures/auth'

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

  // Điểm thưởng không chặn xoá, chỉ cảnh báo: đang tải số dư thì khoá nút (không bỏ lỡ cảnh báo).
  test('khách còn điểm thưởng → nút khoá khi đang tải, rồi hiện cảnh báo số điểm', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    await page.route('**/api/customer/reward-wallet', async (route) => {
      await gate
      await route.fulfill({ json: { reward_points: 37, max_rate_percent: 10, cashback_percent: 5, commission_percent: 5 } })
    })
    // Khách seed, KHÔNG bấm xoá — chỉ kiểm cảnh báo/trạng thái nút (số dư điểm được stub).
    await loginExisting(page, APP.customer, SEEDED.customer)
    await expect(page).toHaveURL(/\/customer\//)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    const del = page.getByRole('button', { name: 'Xoá vĩnh viễn' })
    await expect(del).toBeDisabled()

    release()
    await expect(page.getByTestId('delete-account-reward-warning')).toContainText('Bạn còn 37 điểm thưởng')
    await expect(del).toBeEnabled()
  })

  test('không tải được số dư điểm → cảnh báo chung, nút xoá vẫn bấm được', async ({ page }) => {
    await page.route('**/api/customer/reward-wallet', (route) => route.fulfill({ status: 500, json: { message: 'lỗi' } }))
    await loginExisting(page, APP.customer, SEEDED.customer)
    await expect(page).toHaveURL(/\/customer\//)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    await expect(page.getByTestId('delete-account-reward-warning'))
      .toHaveText('Bạn có thể còn điểm thưởng — điểm sẽ mất khi xoá tài khoản.', { timeout: 15_000 })
    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    await expect(page.getByRole('button', { name: 'Xoá vĩnh viễn' })).toBeEnabled()
  })

  test('API số dư điểm treo → sau ~8s cảnh báo chung, nút xoá bấm được', async ({ page }) => {
    // Không bao giờ trả lời — sheet phải tự hết giờ (timeout 8s), không khoá nút mãi.
    await page.route('**/api/customer/reward-wallet', () => {})
    await loginExisting(page, APP.customer, SEEDED.customer)
    await expect(page).toHaveURL(/\/customer\//)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    const del = page.getByRole('button', { name: 'Xoá vĩnh viễn' })
    await expect(del).toBeDisabled()

    await expect(page.getByTestId('delete-account-reward-warning'))
      .toHaveText('Bạn có thể còn điểm thưởng — điểm sẽ mất khi xoá tài khoản.', { timeout: 12_000 })
    await expect(del).toBeEnabled()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })

  test('còn 300 điểm → cảnh báo số điểm; mở lại sheet lấy số dư mới', async ({ page }) => {
    let points = 300
    let sheetCalls = 0
    await page.route('**/api/customer/reward-wallet', (route) => {
      sheetCalls++
      return route.fulfill({ json: { reward_points: points, max_rate_percent: 10, cashback_percent: 5, commission_percent: 5 } })
    })
    await loginExisting(page, APP.customer, SEEDED.customer)
    await expect(page).toHaveURL(/\/customer\//)

    await page.goto(`${APP.customer}/customer/profile`)
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    const warning = page.getByTestId('delete-account-reward-warning')
    await expect(warning).toContainText('Bạn còn 300 điểm thưởng')
    await page.getByLabel('Nhập mã PIN để xác nhận').fill(TEST_PASSWORD)
    await expect(page.getByRole('button', { name: 'Xoá vĩnh viễn' })).toBeEnabled()

    // Đóng, số dư đổi về 0 (vd vừa dùng hết điểm), mở lại → gọi lại API, không còn cảnh báo.
    await page.getByRole('button', { name: 'Đóng' }).click()
    points = 0
    const before = sheetCalls
    await page.getByRole('button', { name: 'Xoá tài khoản' }).click()
    await expect.poll(() => sheetCalls).toBeGreaterThan(before)
    await expect(page.getByRole('button', { name: 'Xoá vĩnh viễn' })).toBeEnabled() // tải xong
    await expect(warning).toHaveCount(0)
  })
})
