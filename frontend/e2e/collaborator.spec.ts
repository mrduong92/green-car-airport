import { test, expect } from '@playwright/test'
import { APP, SEEDED, randomPhone } from './fixtures/testData'
import { loginExisting, registerCustomer } from './fixtures/auth'
import { stubGoong } from './fixtures/goong'
import {
  adminToggleCollaborator,
  createBooking,
  driverAcceptTrip,
  driverCompleteTrip,
  newActor,
  readCollaboratorWalletPoints,
  readDriverWalletPoints,
} from './fixtures/flows'

const COLLECTION_FEE = 200_000
const COLLABORATOR_CREDIT = 160 // floor(200.000 * 0.80 / 1.000)
const COLLECTION_DEBIT = 200 // full thu hộ debited from the driver
const APP_FEE_POINTS = 100 // 20% of 500.000đ

test.describe('Cộng tác viên — Thu hộ', () => {
  test('khách thường không thấy field Thu Hộ', async ({ browser }) => {
    // ── TC3.2 ──────────────────────────────────────────────────────────────
    const customerF = await newActor(browser)
    await stubGoong(customerF)
    await registerCustomer(customerF, randomPhone())

    await customerF.goto(`${APP.customer}/customer/booking`)
    await expect(customerF.getByText('Thu Hộ (tuỳ chọn)')).toHaveCount(0)
    await expect(customerF.locator('input[name="collection_fee"]')).toHaveCount(0)
  })

  test('CTV nhận 80% thu hộ vào ví, tài xế bị trừ đủ khoản thu hộ', async ({ browser }) => {
    const collaboratorPhone = randomPhone()

    // Tạo khách E trước, rồi admin mới kích hoạt CTV.
    const setup = await newActor(browser)
    await registerCustomer(setup, collaboratorPhone)
    await setup.close()

    // ── TC3.1 — admin bật CTV cho khách E ──────────────────────────────────
    const admin = await newActor(browser)
    await loginExisting(admin, APP.admin, SEEDED.admin)
    await expect(admin).toHaveURL(/\/dashboard/)
    await adminToggleCollaborator(admin, collaboratorPhone)

    // Đăng nhập lại sau khi bật cờ để store nhận is_collaborator mới.
    const collaborator = await newActor(browser)
    await stubGoong(collaborator)
    await loginExisting(collaborator, APP.customer, collaboratorPhone)
    await expect(collaborator).toHaveURL(/\/customer\/booking/)

    expect(await readCollaboratorWalletPoints(collaborator)).toBe(0)

    // ── TC3.3 — đặt chuyến kèm thu hộ, tài xế hoàn thành ───────────────────
    await collaborator.goto(`${APP.customer}/customer/booking`)
    await expect(collaborator.getByText('Thu Hộ (tuỳ chọn)')).toBeVisible()
    await createBooking(collaborator, { collectionFee: COLLECTION_FEE })

    const driver = await newActor(browser)
    await loginExisting(driver, APP.driver, SEEDED.driver)
    await expect(driver).toHaveURL(/\/driver\/trips/)
    const driverPointsBefore = await readDriverWalletPoints(driver)

    await driverAcceptTrip(driver)
    await driverCompleteTrip(driver)

    expect(await readDriverWalletPoints(driver)).toBe(
      driverPointsBefore - APP_FEE_POINTS - COLLECTION_DEBIT,
    )
    expect(await readCollaboratorWalletPoints(collaborator)).toBe(COLLABORATOR_CREDIT)
  })
})
