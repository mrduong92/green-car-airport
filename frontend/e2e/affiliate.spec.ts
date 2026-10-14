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
  await expect(page.getByText('Dùng điểm cuốc')).toBeVisible()

  await page.goto(`${APP.customer}/customer/referrals`)
  await expect(page.getByTestId('referrals-total')).toBeVisible()
})
