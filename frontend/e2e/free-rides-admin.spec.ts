import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'
import { pushFreeRides, pushZaloGroups } from './fixtures/freeRides'
import { newActor, cleanupActors } from './fixtures/flows'

// Force-closes the driver context opened via newActor() if the test throws before its own
// explicit handling — see flows.ts for why every spec file using newActor registers this itself.
test.afterEach(cleanupActors)

// Giai đoạn 4: trang admin "Cuốc Free" (tab Nhóm Zalo / Người bắn / Tình trạng). Group id + sender
// uid đều gắn tag theo thời gian chạy nên test chạy lại được (không đụng dữ liệu lần trước); dọn
// lại (bật nhóm, bỏ chặn người bắn) trong finally để một lần chạy lỗi giữa chừng không để lại
// trạng thái bẩn — cho lần chạy sau của chính spec này, lẫn cho free-rides.spec.ts vốn dùng
// chung tài xế seed (0912345678) để xem tab Free.
test('admin bật/tắt nhóm Zalo và chặn/bỏ chặn người bắn, ảnh hưởng ngay tab Free của tài xế', async ({ page, browser }) => {
  const tag = Date.now().toString(36)
  const groupId = `e2e-adm-${tag}`
  const groupName = `Nhóm E2E Admin ${tag}`
  const groupSenderUid = `e2e-adm-g-${tag}`
  const blockSenderUid = `e2e-adm-s-${tag}`
  const pickupGroup = `Điểm nhóm admin ${tag}`
  const pickupSender = `Điểm người bắn admin ${tag}`

  // pushFreeRides ghi zalo_group_id dạng text thẳng vào free_rides, không tạo hàng zalo_groups —
  // phải tự đăng ký nhóm qua pushZaloGroups để nó xuất hiện (và bật/tắt được) ở tab Nhóm Zalo.
  await pushZaloGroups([{ zaloGroupId: groupId, name: groupName }])
  await pushFreeRides([
    // Tab Người bắn gộp theo mã QR hồ sơ → mã gắn tag theo lần chạy, để hàng chỉ chứa uid của lần này.
    { pickup: pickupGroup, senderUid: groupSenderUid, qrCode: `e2eadmg${tag}`, zaloGroupId: groupId, groupName },
    { pickup: pickupSender, senderUid: blockSenderUid, qrCode: `e2eadms${tag}` },
  ])

  await loginExisting(page, APP.admin, SEEDED.admin)
  await expect(page).toHaveURL(/\/dashboard/)
  await page.goto(`${APP.admin}/free-rides`)

  const driver = await newActor(browser)
  await loginExisting(driver, APP.driver, SEEDED.driver)
  await expect(driver).toHaveURL(/\/driver\/trips/)
  await driver.getByRole('link', { name: 'Free' }).click()
  await expect(driver).toHaveURL(/\/driver\/free/)

  const groupCard = driver.getByTestId('free-ride-card').filter({ hasText: pickupGroup })
  const senderCard = driver.getByTestId('free-ride-card').filter({ hasText: pickupSender })

  try {
    // ── Tab Nhóm Zalo: tìm theo tên nhóm e2e, tắt → tài xế hết thấy cuốc của nhóm đó ─────────
    // Từ b26900f, tab mặc định là "Nick Zalo" (?tab=accounts), không còn là Nhóm Zalo — phải bấm
    // tab Nhóm tường minh trước khi thao tác với nội dung của nó.
    await expect(page.getByTestId('admin-free-tab-groups')).toBeVisible()
    await page.getByTestId('admin-free-tab-groups').click()
    await page.getByPlaceholder('Tìm theo tên nhóm').fill(tag)
    const groupRow = page.getByTestId('admin-group-row').filter({ hasText: groupName })
    await expect(groupRow).toBeVisible()
    const groupToggle = groupRow.getByTestId('admin-group-toggle')
    await expect(groupToggle).toHaveAttribute('aria-checked', 'true')
    await expect(groupCard).toBeVisible()

    // Đợi PATCH thật sự thành công trước khi kiểm tra bên tài xế — toggle optimistic-update ngay
    // trên UI (onMutate) trước khi server ghi xong, tải lại trang tài xế quá sớm sẽ đọc phải
    // enabled=true cũ và gây flaky.
    const [toggleOffResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/admin/free-rides/groups/${groupId}`) && r.request().method() === 'PATCH'),
      groupToggle.click(),
    ])
    expect(toggleOffResp.ok()).toBeTruthy()
    await expect(groupToggle).toHaveAttribute('aria-checked', 'false')

    await driver.reload()
    await expect(groupCard).toHaveCount(0)

    // ── Tab Người bắn: tìm người bắn e2e → chặn (xác nhận) → tài xế hết thấy cuốc người đó ───
    await page.getByTestId('admin-free-tab-senders').click()
    await page.getByPlaceholder('Tìm theo tên, nhóm, UID, mã QR').fill(blockSenderUid)
    const senderRow = page.getByTestId('admin-sender-row').filter({ hasText: blockSenderUid })
    await expect(senderRow).toBeVisible()
    await expect(senderRow.getByTestId('admin-sender-contact')).toHaveAttribute('href', `zalo://qr/p/e2eadms${tag}`)
    await expect(senderCard).toBeVisible()

    await senderRow.getByTestId('admin-sender-block').click()
    // ConfirmDialog không có testid riêng và nhãn nút xác nhận ("Chặn") trùng nhãn nút ở hàng danh
    // sách, nên phải khoanh vùng theo khung dialog (lọc theo tiêu đề) để tránh khớp nhầm 2 phần tử.
    const confirmBlockDialog = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Chặn người bắn này?' })
    await confirmBlockDialog.getByRole('button', { name: 'Chặn', exact: true }).click()
    await expect(page.getByText('Đã chặn người bắn')).toBeVisible()
    await expect(senderRow.getByTestId('admin-sender-unblock')).toBeVisible()

    await driver.reload()
    await expect(senderCard).toHaveCount(0)

    // Bỏ chặn → hiện lại cho cả admin lẫn tài xế.
    await senderRow.getByTestId('admin-sender-unblock').click()
    await expect(page.getByText('Đã bỏ chặn người bắn')).toBeVisible()
    await expect(senderRow.getByTestId('admin-sender-block')).toBeVisible()

    await driver.reload()
    await expect(senderCard).toBeVisible()

    // ── Tab Tình trạng: hiển thị được (dù có service gửi tín hiệu hay chưa) ──────────────────
    await page.getByTestId('admin-free-tab-status').click()
    await expect(page.getByText('Nhóm đang bật')).toBeVisible()
  } finally {
    // Dọn lại dù test thành công hay lỗi giữa chừng: bật lại nhóm, bỏ chặn người bắn — để lần
    // chạy sau (và free-rides.spec.ts) không thấy trạng thái bẩn do lần chạy này để lại.
    await page.getByTestId('admin-free-tab-groups').click()
    await page.getByPlaceholder('Tìm theo tên nhóm').fill(tag)
    const cleanupToggle = page.getByTestId('admin-group-row').filter({ hasText: groupName }).getByTestId('admin-group-toggle')
    if (await cleanupToggle.isVisible().catch(() => false) && (await cleanupToggle.getAttribute('aria-checked')) === 'false') {
      await cleanupToggle.click()
    }

    await page.getByTestId('admin-free-tab-senders').click()
    await page.getByPlaceholder('Tìm theo tên, nhóm, UID, mã QR').fill(blockSenderUid)
    const cleanupUnblock = page.getByTestId('admin-sender-row').filter({ hasText: blockSenderUid }).getByTestId('admin-sender-unblock')
    if (await cleanupUnblock.isVisible().catch(() => false)) {
      await cleanupUnblock.click()
    }
  }
})
