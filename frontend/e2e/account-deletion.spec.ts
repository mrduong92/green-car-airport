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
})
