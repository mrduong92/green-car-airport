import { test, expect, type Page } from '@playwright/test'

/**
 * E2E auth cho PRODUCTION — toàn bộ READ-ONLY.
 *
 * Không test đăng ký: production đã tắt dev bypass `000000` (commit 3c50f33)
 * nên đăng ký cần OTP thật gửi qua ZNS — test không nhận được SMS.
 * Chi tiết vì sao suite localhost không dùng được: xem README.md cùng thư mục.
 *
 * Endpoint duy nhất các test này gọi ngoài login là `POST /auth/check-phone`,
 * đã kiểm là SELECT thuần (AuthController::checkPhone) — không ghi gì.
 */

const APP = {
  customer: process.env.E2E_URL_CUSTOMER ?? 'https://greenca.vn',
  driver:   process.env.E2E_URL_DRIVER   ?? 'https://driver.greenca.vn',
  admin:    process.env.E2E_URL_ADMIN    ?? 'https://admin.greenca.vn',
} as const

const ADMIN_PHONE    = process.env.E2E_ADMIN_PHONE ?? ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''

/** Dải số test 0999 — không trùng đầu số thật, và chắc chắn chưa đăng ký. */
const UNREGISTERED_PHONE = '0999000111'

/** Mã bypass cũ. Phải KHÔNG đăng nhập được trên production. */
const DEAD_BYPASS = '000000'

async function submitPhone(page: Page, appUrl: string, phone: string): Promise<void> {
  await page.goto(`${appUrl}/login`)
  await page.getByPlaceholder('9xx xxx xxx').fill(phone)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

async function submitPassword(page: Page, password: string): Promise<void> {
  await page.getByPlaceholder('••••••').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

/**
 * Thu hồi token vừa cấp cho lần đăng nhập này, để suite không bỏ lại
 * personal_access_tokens chết trên production sau mỗi lần chạy.
 */
async function revokeToken(page: Page, appUrl: string): Promise<void> {
  const ok = await page.evaluate(async (base) => {
    const token = localStorage.getItem('token')
    if (!token) return false
    const res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    return res.ok
  }, appUrl)

  expect(ok, 'logout phải thu hồi được token vừa tạo').toBe(true)
}

test.describe('Production auth — 3 app đều phục vụ được', () => {
  test('app khách hàng mở được trang đăng nhập', async ({ page }) => {
    const res = await page.goto(`${APP.customer}/login`)
    expect(res?.status()).toBe(200)
    await expect(page.getByPlaceholder('9xx xxx xxx')).toBeVisible()
  })

  test('app tài xế mở được trang đăng nhập', async ({ page }) => {
    const res = await page.goto(`${APP.driver}/login`)
    expect(res?.status()).toBe(200)
    await expect(page.getByPlaceholder('9xx xxx xxx')).toBeVisible()
  })

  test('app admin mở được trang đăng nhập', async ({ page }) => {
    const res = await page.goto(`${APP.admin}/login`)
    expect(res?.status()).toBe(200)
    await expect(page.getByText('Quản trị viên')).toBeVisible()
  })
})

test.describe('Production auth — số chưa đăng ký', () => {
  test('app khách hàng báo chưa có tài khoản', async ({ page }) => {
    await submitPhone(page, APP.customer, UNREGISTERED_PHONE)
    await expect(page.getByText('Chưa có tài khoản')).toBeVisible()
    // Không được lọt vào trong app.
    await expect(page).toHaveURL(/\/login/)
  })

  test('app tài xế báo chưa đăng ký tài xế', async ({ page }) => {
    await submitPhone(page, APP.driver, UNREGISTERED_PHONE)
    await expect(page.getByText('Chưa đăng ký tài xế')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('app admin báo không có quyền truy cập', async ({ page }) => {
    await submitPhone(page, APP.admin, UNREGISTERED_PHONE)
    await expect(page.getByText('Không có quyền truy cập')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Production auth — route được bảo vệ', () => {
  const guarded = [
    { name: 'khách hàng', url: `${APP.customer}/customer/booking` },
    { name: 'tài xế',     url: `${APP.driver}/driver/trips` },
    { name: 'admin',      url: `${APP.admin}/dashboard` },
  ]

  for (const { name, url } of guarded) {
    test(`chưa đăng nhập vào route ${name} thì bị đẩy về /login`, async ({ page }) => {
      await page.goto(url)
      await expect(page).toHaveURL(/\/login/)
    })
  }
})

test.describe('Production auth — tài khoản admin thật', () => {
  test.skip(
    !ADMIN_PHONE || !ADMIN_PASSWORD,
    'Cần E2E_ADMIN_PHONE và E2E_ADMIN_PASSWORD — xem e2e-prod/README.md',
  )

  test('mã bypass 000000 KHÔNG đăng nhập được', async ({ page }) => {
    await submitPhone(page, APP.admin, ADMIN_PHONE)
    // Số admin có thật nên phải sang bước nhập mật khẩu.
    await expect(page.getByPlaceholder('••••••')).toBeVisible()

    await submitPassword(page, DEAD_BYPASS)

    // Phải bị từ chối và ở nguyên trang login.
    await expect(page.getByText('Mật khẩu không đúng.')).toBeVisible()
    await expect(page).not.toHaveURL(/\/dashboard/)
  })

  test('mật khẩu sai bị từ chối', async ({ page }) => {
    await submitPhone(page, APP.admin, ADMIN_PHONE)
    await expect(page.getByPlaceholder('••••••')).toBeVisible()

    await submitPassword(page, '111111')

    await expect(page.getByText('Mật khẩu không đúng.')).toBeVisible()
    await expect(page).not.toHaveURL(/\/dashboard/)
  })

  test('mật khẩu đúng đăng nhập được vào dashboard', async ({ page }) => {
    await submitPhone(page, APP.admin, ADMIN_PHONE)
    await expect(page.getByPlaceholder('••••••')).toBeVisible()

    await submitPassword(page, ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/dashboard/)

    // Đây là test DUY NHẤT ghi vào DB production: đăng nhập thành công tạo
    // 1 dòng personal_access_tokens. Gọi logout để xoá đúng token vừa tạo,
    // nếu không mỗi lần chạy suite lại bỏ lại một token chết.
    await revokeToken(page, APP.admin)
  })

  test('số admin không đăng nhập được vào app khách hàng', async ({ page }) => {
    // Tài khoản admin không có role customer → phải bị chặn ngay bước số điện thoại.
    await submitPhone(page, APP.customer, ADMIN_PHONE)
    await expect(page.getByText('Chưa có tài khoản')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('số admin không đăng nhập được vào app tài xế', async ({ page }) => {
    await submitPhone(page, APP.driver, ADMIN_PHONE)
    await expect(page.getByText('Chưa đăng ký tài xế')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
