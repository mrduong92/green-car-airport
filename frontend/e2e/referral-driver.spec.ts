import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { getDriverReferralCode, loginExisting, registerCustomer, registerDriver } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import {
  adminApproveDriver,
  adminTopupDriver,
  cleanupActors,
  createBooking,
  driverAcceptTrip,
  driverCompleteTrip,
  newActor,
  readDriverWalletPoints,
} from './fixtures/flows'

const DRIVER_REFERRAL_REWARD = 100
const APP_FEE_POINTS = 100 // 20% of 500.000đ, at 1 point = 1.000đ

// Force-closes any newActor() context left open by a test that throws before
// reaching its own explicit closes below — see flows.ts for why every spec
// file that uses newActor must register this itself.
test.afterEach(cleanupActors)

test.describe('Referral tài xế → tài xế', () => {
  test('thưởng 100 điểm cho cả hai bên sau chuyến đầu tiên của tài xế được giới thiệu', async ({
    browser,
  }) => {
    const driverBPhone = randomPhone()
    // Bookings must come from a fresh customer — the seeded customer already
    // holds an active booking and is redirected away from the booking form.
    const customerPhone = randomPhone()

    // ── TC1.1 — tài xế A lấy mã, tài xế B đăng ký qua link ──────────────────
    const driverA = await newActor(browser)
    await loginExisting(driverA, APP.driver, SEEDED.driver)
    await expect(driverA).toHaveURL(/\/driver\/trips/)
    const referralCode = await getDriverReferralCode(driverA)
    expect(referralCode).toMatch(/-/)
    const aPointsBefore = await readDriverWalletPoints(driverA)

    const driverBSignup = await newActor(browser)
    await registerDriver(driverBSignup, driverBPhone, { referralCode })

    // ── TC1.2 — admin duyệt B nhưng B chưa có chuyến nào → chưa thưởng ──────
    const admin = await newActor(browser)
    await loginExisting(admin, APP.admin, SEEDED.admin)
    await expect(admin).toHaveURL(/\/dashboard/)
    await adminApproveDriver(admin, driverBPhone)

    // Context đăng ký vẫn giữ approval_status='pending' trong store đã persist,
    // nên phải mở context mới và đăng nhập lại để guard cho vào /driver/*.
    await driverBSignup.context().close()
    const driverB = await newActor(browser)
    await loginExisting(driverB, APP.driver, driverBPhone)
    await expect(driverB).toHaveURL(/\/driver\/trips/)

    // Tài xế mới đăng ký mặc định offline (AuthController.php:187 đặt is_online=false,
    // ghi đè default=true của migration driver_profiles) — phải bật "Sẵn sàng nhận cuốc"
    // thì danh sách cuốc mới hiển thị. Trạng thái online lưu ở server nên chỉ cần bật một
    // lần cho cả TC1.3 và TC1.4.
    const onlineToggle = driverB.getByRole('switch')
    await expect(onlineToggle).toHaveCount(1)
    // TripListPage.tsx:23 dùng `profile?.is_online ?? true` — trong lúc hồ sơ tài xế
    // còn đang tải, công tắc hiển thị tạm như đang online (mặc định true), dù giá trị
    // thật trên server là false. Bấm ngay lúc đó sẽ tính sai chiều bật/tắt (gửi
    // is_online=false, một no-op). Phải đợi công tắc hiển thị đúng trạng thái false
    // thật sự rồi mới bấm.
    await expect(onlineToggle).toHaveAttribute('aria-checked', 'false')
    // Chờ chính response PATCH /driver/status — TanStack Query cập nhật cache lạc quan
    // (optimistic) ngay khi click nên aria-checked đổi trước khi request thật sự hoàn
    // tất; nếu điều hướng ngay sau click mà không đợi, request có thể bị huỷ giữa chừng
    // và is_online sẽ không thực sự được lưu ở server.
    await Promise.all([
      driverB.waitForResponse((r) => new URL(r.url()).pathname === '/api/driver/status'),
      onlineToggle.click(),
    ])
    await expect(onlineToggle).toHaveAttribute('aria-checked', 'true')

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsBefore)
    expect(await readDriverWalletPoints(driverB)).toBe(0)

    // B cần điểm để trả phí app 20% khi nhận cuốc.
    await adminTopupDriver(admin, driverBPhone, 500)
    expect(await readDriverWalletPoints(driverB)).toBe(500)
    // Admin's last action — close it before a fourth actor joins. Each
    // logged-in context holds an SSE stream that occupies one of the PHP-FPM
    // pool's few children for its lifetime, and contexts outlive the test that
    // created them, so unclosed actors starve the pool into 504s.
    await admin.context().close()

    // ── TC1.3 — B hoàn thành chuyến đầu tiên → cả A và B nhận 100 điểm ──────
    const customer = await newActor(browser)
    await stubGoong(customer)
    await registerCustomer(customer, customerPhone)
    await createBooking(customer)

    await driverAcceptTrip(driverB)
    await driverCompleteTrip(driverB)

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsBefore + DRIVER_REFERRAL_REWARD)
    // B: nạp 500 − phí app 100 + thưởng 100
    expect(await readDriverWalletPoints(driverB)).toBe(500 - APP_FEE_POINTS + DRIVER_REFERRAL_REWARD)

    // ── TC1.4 — chuyến thứ hai không phát thêm thưởng referral ──────────────
    const aPointsAfterReward = await readDriverWalletPoints(driverA)
    const bPointsAfterReward = await readDriverWalletPoints(driverB)

    await createBooking(customer)
    // The customer has placed its last booking.
    await customer.context().close()
    await driverAcceptTrip(driverB)
    await driverCompleteTrip(driverB)

    expect(await readDriverWalletPoints(driverA)).toBe(aPointsAfterReward)
    // B chỉ mất thêm phí app, không nhận thêm thưởng.
    expect(await readDriverWalletPoints(driverB)).toBe(bPointsAfterReward - APP_FEE_POINTS)

    await driverB.context().close()
    await driverA.context().close()
  })
})
