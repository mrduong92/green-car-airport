import { createHmac } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { APP, SEEDED } from './fixtures/testData'
import { loginExisting } from './fixtures/auth'

const API = process.env.E2E_API ?? 'http://localhost:8080'
const SECRET = process.env.E2E_ZALO_SECRET ?? 'dev-secret'

// 1x1 ảnh PNG trong suốt hợp lệ (67 byte) — đủ để <img> render, không cần giải mã thật.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function signedHeaders(ts: string, body: string): Record<string, string> {
  const signature = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
  return { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Zalo-Timestamp': ts, 'X-Zalo-Signature': signature }
}

interface AccountRequestRow {
  id: number
  type: 'login' | 'remove'
  account_id: string
}

/** Hỏi đúng endpoint + chữ ký service Node dùng (GET, không có body → ký trên chuỗi rỗng). */
async function fetchAccountRequests(): Promise<AccountRequestRow[]> {
  const ts = String(Math.floor(Date.now() / 1000))
  const res = await fetch(`${API}/api/internal/zalo/account-requests`, { headers: signedHeaders(ts, '') })
  if (res.status !== 200) throw new Error(`GET account-requests lỗi HTTP ${res.status}: ${await res.text()}`)
  return ((await res.json()) as { requests: AccountRequestRow[] }).requests
}

/**
 * Giả lập service Node hỏi mỗi 5 giây: chờ tới khi thấy yêu cầu loại `type` cho `accountId` trong
 * danh sách 'pending'. KHÔNG lấy id từ response của trang admin — service thật không có nó, nó chỉ
 * biết qua đúng endpoint nội bộ này.
 */
async function waitForAccountRequest(accountId: string, type: 'login' | 'remove', timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const requests = await fetchAccountRequests()
    const match = requests.find((r) => r.account_id === accountId && r.type === type)
    if (match) return match.id
    if (Date.now() > deadline) {
      throw new Error(`Không thấy yêu cầu '${type}' cho ${accountId} trong ${timeoutMs}ms qua /internal/zalo/account-requests`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}

/** Báo tiến độ 1 yêu cầu — ký HMAC như service thật (POST, ký trên JSON body thô). */
async function updateAccountRequest(id: number, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload)
  const ts = String(Math.floor(Date.now() / 1000))
  const res = await fetch(`${API}/api/internal/zalo/account-requests/${id}`, { method: 'POST', headers: signedHeaders(ts, body), body })
  if (res.status !== 200) throw new Error(`POST account-requests/${id} lỗi HTTP ${res.status}: ${await res.text()}`)
}

// Giai đoạn 5, tab admin "Nick Zalo": đăng nhập/gỡ nick bằng mã QR. Laravel không bao giờ gọi vào
// service Node — chữ ký HMAC ở trên tái tạo đúng những gì service thật gửi, nên test này đóng vai
// "service" thay vì mở Zalo thật (constraints: không gọi Zalo thật trong test tự động).
//
// ⚠️ RỦI RO THẬT nếu có service giai đoạn 5 đang chạy nhắm vào CÙNG API_BASE_URL (vd. staging):
// AccountRequestsPoller.poll() (zalo-service/src/account-requests.ts) không lọc theo "account_id đã
// biết" — nó lấy BẤT KỲ yêu cầu 'pending' nào khớp mẫu account_id rồi gọi thẳng `login()` (runQrLogin
// → Zalo thật) cho yêu cầu đó, kể cả account_id lạ hoắc "e2e-<tag>" của test này. Tag theo thời gian
// chạy chỉ giúp test chạy lại được (tránh đụng request cũ), KHÔNG cách ly được với service thật đang
// polling cùng endpoint — service đó vẫn sẽ thử đăng nhập Zalo thật cho request giả này.
// Vì vậy test chỉ chạy khi người vận hành chủ động xác nhận không có service giai đoạn 5 nào đang
// polling API_BASE_URL (xem e2e/README.md mục "Rủi ro service Zalo thật").
test('admin thêm nick Zalo bằng mã QR (giả lập service) rồi gỡ nick', async ({ page }) => {
  test.skip(
    !process.env.E2E_ALLOW_ACCOUNT_REQUESTS,
    'Bỏ qua: cần E2E_ALLOW_ACCOUNT_REQUESTS=1 — test tạo yêu cầu đăng nhập nick thật qua ' +
      '/internal/zalo/account-requests; nếu có service giai đoạn 5 đang polling cùng API_BASE_URL, nó ' +
      'sẽ chạy loginQR (Zalo thật) cho yêu cầu giả này. Xem e2e/README.md.',
  )

  const tag = Date.now().toString(36)
  const accountId = `e2e-${tag}`
  const zaloName = `Zalo E2E ${tag}`

  await loginExisting(page, APP.admin, SEEDED.admin)
  await expect(page).toHaveURL(/\/dashboard/)
  await page.goto(`${APP.admin}/free-rides`)
  await page.getByTestId('admin-free-tab-accounts').click()

  // ── Thêm nick: admin tạo yêu cầu, "service" (giả lập) tự thấy qua GET, báo QR rồi báo xong ────
  await page.getByTestId('admin-account-add').click()
  // Tiêu đề hộp thoại không đổi suốt vòng đời ở mode 'create' (xem AddAccountDialog) — dùng để
  // khoanh vùng tránh khớp nhầm chữ "Đã đăng nhập: ..." cũng xuất hiện ở toast thông báo.
  const dialog = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Thêm nick Zalo' })
  await page.getByTestId('admin-account-name-input').fill(accountId)
  await page.getByRole('button', { name: 'Tạo mã QR' }).click()

  const loginRequestId = await waitForAccountRequest(accountId, 'login')

  await updateAccountRequest(loginRequestId, {
    status: 'qr_ready',
    qr_image: TINY_PNG_BASE64,
    qr_expires_at: Date.now() + 60_000,
  })
  await expect(dialog.getByTestId('admin-account-qr')).toBeVisible({ timeout: 10_000 })

  await updateAccountRequest(loginRequestId, {
    status: 'done',
    zalo_uid: `uid-${tag}`,
    zalo_name: zaloName,
  })
  await expect(dialog.getByText(`Đã đăng nhập: ${zaloName}`)).toBeVisible({ timeout: 10_000 })
  await dialog.getByRole('button', { name: 'Đóng' }).click()

  // ── Gỡ nick: nút "Gỡ" trong UI chỉ có trên thẻ nick lấy từ heartbeat thật (ZaloServiceMonitor);
  // nick giả lập ở test này chưa từng gửi heartbeat nên không có thẻ để bấm. Gọi thẳng API gỡ nick
  // bằng đúng phiên admin đang đăng nhập (token Sanctum lấy từ localStorage của trang) để vẫn đi
  // qua ZaloAccountController::destroy() thật, rồi xác nhận đúng cách service thật sẽ thấy: hỏi
  // GET /internal/zalo/account-requests.
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token).toBeTruthy()

  const removeRes = await fetch(`${API}/api/admin/free-rides/accounts/${accountId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  expect(removeRes.status).toBe(201)
  const removeBody = (await removeRes.json()) as { id: number; type: string; account_id: string }
  expect(removeBody.type).toBe('remove')
  expect(removeBody.account_id).toBe(accountId)

  const removeRequestId = await waitForAccountRequest(accountId, 'remove')
  expect(removeRequestId).toBe(removeBody.id)

  // Dọn lại: đánh dấu yêu cầu đã xong ngay — không để ở trạng thái mở (pending/qr_ready), phòng
  // trường hợp có service thật đang chạy cũng polling endpoint này.
  await updateAccountRequest(removeRequestId, { status: 'done' })
})
