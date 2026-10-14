import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import { fillBookingForm } from './fixtures/flows'

// Đặt số dư điểm thưởng cho khách seed (DB dev local, không phải sqlite test).
// `-u root`: tinker không ghi được $HOME/.config/psysh khi chạy bằng www-data
// trong container (xem ghi chú "tinker can't run as www-data").
function setReward(phone: string, points: number) {
  execSync(
    `docker compose exec -T -u root app php artisan tinker --execute="\\$u=App\\Models\\User::where('phone','${phone}')->where('role','customer')->first(); App\\Models\\Wallet::updateOrCreate(['user_id'=>\\$u->id],[])->update(['reward_points'=>${points}]);"`,
    { cwd: '..' },
  )
}

// BookingFormPage redirects a customer with an active booking
// (finding_driver/accepted/picking_up/in_progress — same list as
// BookingController::active()) straight to its status page instead of
// rendering the form. The seeded customer accumulates these across repeated
// local e2e runs against the persistent dev DB, so clear them before this
// test's own fillBookingForm() call, which needs the form to actually render.
function clearActiveBookings(phone: string) {
  execSync(
    `docker compose exec -T -u root app php artisan tinker --execute="\\$u=App\\Models\\User::where('phone','${phone}')->where('role','customer')->first(); App\\Models\\Booking::where('customer_id',\\$u->id)->whereIn('status',['finding_driver','accepted','picking_up','in_progress'])->update(['status'=>'cancelled']);"`,
    { cwd: '..' },
  )
}

test('khách có điểm bật "Dùng điểm" → tổng tiền giảm, đơn có dòng điểm; trang Ví điểm và Bạn bè', async ({ page }) => {
  setReward(SEEDED.customer, 500)
  clearActiveBookings(SEEDED.customer)
  await stubGoong(page)
  await loginExisting(page, APP.customer, SEEDED.customer)
  await expect(page).toHaveURL(/\/customer\/booking/)

  await fillBookingForm(page)

  const toggle = page.getByTestId('use-points-toggle')
  await expect(toggle).toBeVisible()
  const totalBefore = await page.getByTestId('booking-total').textContent()
  await toggle.click()
  await expect(page.getByTestId('booking-total')).not.toHaveText(totalBefore ?? '')
  await page.getByRole('button', { name: /Đặt xe/ }).click()
  await expect(page).toHaveURL(/\/customer\/booking\/\d+/, { timeout: 60_000 })
  await expect(page.getByTestId('booking-points-line')).toBeVisible()

  await page.goto(`${APP.customer}/customer/reward-wallet`)
  await expect(page.getByTestId('reward-balance')).toBeVisible()
  // `.first()`: repeated local runs leave more than one "Dùng điểm cuốc #N"
  // row in the seeded customer's reward transaction history (dev DB persists
  // across runs — not reset between them), so a plain getByText is a strict-
  // mode violation here. Any match proves the spend transaction was recorded.
  await expect(page.getByText('Dùng điểm cuốc').first()).toBeVisible()

  await page.goto(`${APP.customer}/customer/referrals`)
  await expect(page.getByTestId('referrals-total')).toBeVisible()
})

test('admin xem trang Giới thiệu và chỉnh 3 tỷ lệ điểm', async ({ page }) => {
  await loginExisting(page, APP.admin, SEEDED.admin)
  // Viewport e2e (430px) là mobile: "Giới thiệu" không phải tab chính nên nằm
  // trong sheet "Thêm" của bottom nav, không hiện trực tiếp như trên sidebar PC.
  await page.getByRole('button', { name: 'Thêm' }).click()
  await page.getByRole('link', { name: 'Giới thiệu' }).click()
  await expect(page.getByTestId('referral-report-top')).toBeVisible()
  await expect(page.getByTestId('referral-report-chart')).toBeVisible()

  await page.goto(`${APP.admin}/settings`)
  await expect(page.getByLabel('% hoàn điểm cho khách')).toBeVisible()
  await expect(page.getByLabel('% hoa hồng giới thiệu')).toBeVisible()
  await expect(page.getByLabel('% tối đa trừ bằng điểm')).toBeVisible()
})

test('admin thấy trạng thái lỗi + nút Thử lại khi báo cáo Giới thiệu tải thất bại', async ({ page }) => {
  await page.route('**/api/admin/referrals**', (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Server error' }),
  }))

  await loginExisting(page, APP.admin, SEEDED.admin)
  await page.getByRole('button', { name: 'Thêm' }).click()
  await page.getByRole('link', { name: 'Giới thiệu' }).click()

  await expect(page.getByText('Không tải được báo cáo giới thiệu')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
})
