import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LoginQRCallbackEventType } from 'zca-js'
import { runQrLogin, QrExpiredError, QrDeclinedError, QR_LIFETIME_MS } from '../src/zalo-login.js'
import { AccountRequestsPoller } from '../src/account-requests.js'
import { silentLogger } from '../src/logger.js'

// ---------- runQrLogin (bọc Zalo.loginQR, KHÔNG gọi Zalo thật) ----------

type Cb = (event: any) => unknown

/** Giả lập Zalo.loginQR: kịch bản nhận cb + actions, tự resolve/reject giống zca-js 2.2.0. */
function fakeLoginQR(script: (cb: Cb, actions: { retry: () => void; abort: () => void }, resolve: (v: unknown) => void) => void) {
  const calls = { retry: 0, abort: 0 }
  const loginQR = (cb: Cb) => new Promise<unknown>((resolve, reject) => {
    const actions = {
      retry: () => { calls.retry++ },
      abort: () => { calls.abort++; reject(new Error('aborted')) },
    }
    script(cb, actions, resolve)
  })
  return { loginQR, calls }
}

const tick = () => new Promise((r) => setImmediate(r))

test('runQrLogin: QR → hết hạn → QR mới → quét xong trả credentials, mỗi QR gọi onQr', async () => {
  const qrs: [string, number][] = []
  const { loginQR, calls } = fakeLoginQR((cb, actions, resolve) => {
    cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: 'png1' }, actions })
    cb({ type: LoginQRCallbackEventType.QRCodeExpired, data: null, actions })
    cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: 'png2' }, actions })
    cb({ type: LoginQRCallbackEventType.QRCodeScanned, data: { avatar: '', display_name: 'A' }, actions })
    cb({ type: LoginQRCallbackEventType.GotLoginInfo, data: { cookie: [], imei: 'i', userAgent: 'u' }, actions: null })
    resolve({})
  })
  const result = await runQrLogin({ loginQR, onQr: async (png, exp) => { qrs.push([png, exp]) }, now: () => 1000 })
  assert.deepEqual(result.credentials, { cookie: [], imei: 'i', userAgent: 'u' })
  assert.deepEqual(qrs, [['png1', 1000 + QR_LIFETIME_MS], ['png2', 1000 + QR_LIFETIME_MS]])
  assert.equal(calls.retry, 1)
  assert.equal(calls.abort, 0)
})

test('runQrLogin: hết 3 lần QR không quét → abort và ném QrExpiredError', async () => {
  const qrs: string[] = []
  const { loginQR, calls } = fakeLoginQR((cb, actions) => {
    for (let i = 1; i <= 3; i++) {
      cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: `png${i}` }, actions })
      cb({ type: LoginQRCallbackEventType.QRCodeExpired, data: null, actions })
    }
  })
  await assert.rejects(runQrLogin({ loginQR, onQr: async (png) => { qrs.push(png) } }), QrExpiredError)
  assert.deepEqual(qrs, ['png1', 'png2', 'png3'])
  assert.equal(calls.retry, 2)
  assert.equal(calls.abort, 1)
})

test('runQrLogin: người dùng từ chối trên điện thoại → abort, ném QrDeclinedError (zca-js treo nếu không abort)', async () => {
  const { loginQR, calls } = fakeLoginQR((cb, actions) => {
    cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: 'p' }, actions })
    cb({ type: LoginQRCallbackEventType.QRCodeDeclined, data: { code: 'x' }, actions })
  })
  await assert.rejects(runQrLogin({ loginQR, onQr: async () => {} }), QrDeclinedError)
  assert.equal(calls.abort, 1)
})

test('runQrLogin: loginQR không bao giờ xong → quá thời gian thì abort và ném lỗi', async () => {
  const { loginQR, calls } = fakeLoginQR((cb, actions) => {
    cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: 'p' }, actions })
  })
  await assert.rejects(runQrLogin({ loginQR, onQr: async () => {}, timeoutMs: 20 }), /quá thời gian/)
  assert.equal(calls.abort, 1)
})

test('runQrLogin: chờ onQr gửi xong rồi mới trả kết quả (qr_ready luôn trước done)', async () => {
  const order: string[] = []
  const { loginQR } = fakeLoginQR((cb, actions, resolve) => {
    cb({ type: LoginQRCallbackEventType.QRCodeGenerated, data: { image: 'p' }, actions })
    cb({ type: LoginQRCallbackEventType.GotLoginInfo, data: { imei: 'i' }, actions: null })
    resolve({})
  })
  await runQrLogin({ loginQR, onQr: async () => { await tick(); await tick(); order.push('qr') } })
  order.push('done')
  assert.deepEqual(order, ['qr', 'done'])
})

test('runQrLogin: loginQR xong mà không có GotLoginInfo → lỗi', async () => {
  const { loginQR } = fakeLoginQR((_cb, _a, resolve) => resolve({}))
  await assert.rejects(runQrLogin({ loginQR, onQr: async () => {} }), /không nhận được phiên/)
})

// ---------- AccountRequestsPoller ----------

function fakeManager() {
  const calls: string[] = []
  const infos = new Map<string, { zaloUid?: string; zaloName?: string; loggedInAt?: number }>()
  return {
    calls,
    infos,
    added: [] as { id: string; credentials: unknown }[],
    async add(account: { id: string; credentials: unknown }) {
      calls.push(`add:${account.id}`)
      this.added.push(account)
      infos.set(account.id, { zaloUid: 'uid-' + account.id, zaloName: 'Tên ' + account.id, loggedInAt: 5 })
    },
    remove(id: string) { calls.push(`remove:${id}`); infos.delete(id) },
    info(id: string) { return infos.get(id) },
  }
}

function harness(opts: {
  requests?: unknown
  getStatus?: number
  getThrows?: boolean
  login?: (onQr: (png: string, exp: number) => Promise<void>) => Promise<{ credentials: unknown }>
  manager?: ReturnType<typeof fakeManager>
}) {
  const dir = mkdtempSync(join(tmpdir(), 'zalo-acc-'))
  const posts: [string, any][] = []
  let gets = 0
  const manager = opts.manager ?? fakeManager()
  const removed: string[] = []
  const added: string[] = []
  const poller = new AccountRequestsPoller({
    get: async (path) => {
      gets++
      assert.equal(path, '/api/internal/zalo/account-requests')
      if (opts.getThrows) return { status: 0, error: 'ECONNREFUSED' }
      return { status: opts.getStatus ?? 200, body: opts.requests ?? { requests: [] } }
    },
    post: async (path, payload) => { posts.push([path, payload]); return { status: 200 } },
    manager,
    accountsDir: dir,
    login: opts.login ?? (async () => ({ credentials: { imei: 'x' } })),
    logger: silentLogger,
    now: () => 1_700_000_000_000,
    onAdded: (id) => added.push(id),
    onRemoved: (id) => removed.push(id),
  })
  return { poller, posts, dir, manager, removed, added, gets: () => gets }
}

test('poller login thành công: qr_ready rồi done, file phiên 0600, manager.add được gọi', async () => {
  const h = harness({
    requests: { requests: [{ id: 7, type: 'login', account_id: 'acc3' }] },
    login: async (onQr) => {
      await onQr('PNG1', 111)
      await onQr('PNG2', 222)
      return { credentials: { imei: 'abc', cookie: [] } }
    },
  })
  await h.poller.poll()

  assert.deepEqual(h.posts, [
    ['/api/internal/zalo/account-requests/7', { status: 'qr_ready', qr_image: 'PNG1', qr_expires_at: 111 }],
    ['/api/internal/zalo/account-requests/7', { status: 'qr_ready', qr_image: 'PNG2', qr_expires_at: 222 }],
    ['/api/internal/zalo/account-requests/7', { status: 'done', zalo_uid: 'uid-acc3', zalo_name: 'Tên acc3' }],
  ])
  const file = join(h.dir, 'acc3.json')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { imei: 'abc', cookie: [] })
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(h.manager.added, [{ id: 'acc3', credentials: { imei: 'abc', cookie: [] } }])
  assert.deepEqual(h.added, ['acc3'])
  // Không còn file tạm
  assert.deepEqual(readdirSync(h.dir), ['acc3.json'])
})

test('poller đăng nhập lại: thay file phiên cũ, vẫn 0600', async () => {
  const h = harness({ requests: { requests: [{ id: 8, type: 'login', account_id: 'acc1' }] } })
  writeFileSync(join(h.dir, 'acc1.json'), '{"old":true}', { mode: 0o644 })
  await h.poller.poll()
  const file = join(h.dir, 'acc1.json')
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { imei: 'x' })
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(h.manager.calls, ['add:acc1'])
})

test('poller login: hết hạn QR → expired, không ghi file, không add', async () => {
  const h = harness({
    requests: { requests: [{ id: 9, type: 'login', account_id: 'acc4' }] },
    login: async () => { throw new QrExpiredError() },
  })
  await h.poller.poll()
  assert.deepEqual(h.posts, [['/api/internal/zalo/account-requests/9', { status: 'expired' }]])
  assert.equal(existsSync(join(h.dir, 'acc4.json')), false)
  assert.deepEqual(h.manager.calls, [])
})

test('poller login lỗi → failed kèm lý do', async () => {
  const h = harness({
    requests: { requests: [{ id: 10, type: 'login', account_id: 'acc4' }] },
    login: async () => { throw new Error('Cannot get API login version') },
  })
  await h.poller.poll()
  assert.deepEqual(h.posts, [['/api/internal/zalo/account-requests/10', { status: 'failed', error: 'Cannot get API login version' }]])
  assert.deepEqual(h.manager.calls, [])
})

test('poller login: lưu phiên xong mà nick không đăng nhập được → failed', async () => {
  const manager = fakeManager()
  manager.add = async function (account) { manager.calls.push(`add:${account.id}`) }
  const h = harness({ requests: { requests: [{ id: 11, type: 'login', account_id: 'acc5' }] }, manager })
  await h.poller.poll()
  assert.equal(h.posts.at(-1)![1].status, 'failed')
  assert.match(h.posts.at(-1)![1].error, /acc5/)
})

test('poller: account_id sai mẫu → failed, không đụng file', async () => {
  const h = harness({ requests: { requests: [{ id: 12, type: 'login', account_id: '../evil' }] } })
  let loginCalled = false
  ;(h.poller as any).deps.login = async () => { loginCalled = true; return { credentials: {} } }
  await h.poller.poll()
  assert.equal(loginCalled, false)
  assert.deepEqual(h.posts, [['/api/internal/zalo/account-requests/12', { status: 'failed', error: 'Tên nick không hợp lệ' }]])
  assert.deepEqual(readdirSync(h.dir), [])
})

test('poller remove: manager.remove, đổi tên file phiên thành .removed-<ms>, done', async () => {
  const h = harness({ requests: { requests: [{ id: 13, type: 'remove', account_id: 'acc2' }] } })
  writeFileSync(join(h.dir, 'acc2.json'), '{"s":1}', { mode: 0o600 })
  await h.poller.poll()
  assert.deepEqual(h.manager.calls, ['remove:acc2'])
  assert.deepEqual(readdirSync(h.dir), ['acc2.json.removed-1700000000000'])
  assert.deepEqual(h.removed, ['acc2'])
  assert.deepEqual(h.posts, [['/api/internal/zalo/account-requests/13', { status: 'done' }]])
})

test('poller remove nick không có file → vẫn done', async () => {
  const h = harness({ requests: { requests: [{ id: 14, type: 'remove', account_id: 'ghost' }] } })
  await h.poller.poll()
  assert.deepEqual(h.posts, [['/api/internal/zalo/account-requests/14', { status: 'done' }]])
})

test('poller: mỗi lần chỉ xử lý MỘT yêu cầu', async () => {
  const h = harness({ requests: { requests: [
    { id: 1, type: 'remove', account_id: 'a' },
    { id: 2, type: 'remove', account_id: 'b' },
  ] } })
  await h.poller.poll()
  assert.deepEqual(h.manager.calls, ['remove:a'])
})

test('poller: đang đăng nhập thì lượt poll khác không lấy thêm yêu cầu', async () => {
  let release: (() => void) | undefined
  const h = harness({
    requests: { requests: [{ id: 20, type: 'login', account_id: 'acc6' }] },
    // Lượt đầu treo tới khi release(); các lượt sau (GET vẫn trả yêu cầu cũ) xong ngay.
    login: () => (release ? Promise.resolve({ credentials: {} }) : new Promise((resolve) => { release = () => resolve({ credentials: {} }) })),
  })
  const first = h.poller.poll()
  await tick()
  assert.equal(h.gets(), 1)
  await h.poller.poll()
  await h.poller.poll()
  assert.equal(h.gets(), 1)
  release!()
  await first
  await h.poller.poll()
  assert.equal(h.gets(), 2)
})

test('poller: GET lỗi mạng / HTTP lỗi / body hỏng → không ném, không làm gì', async () => {
  for (const opts of [{ getThrows: true }, { getStatus: 500 }, { requests: { nope: 1 } }, { requests: { requests: [{ id: 'x' }] } }]) {
    const h = harness(opts)
    await h.poller.poll()
    assert.deepEqual(h.posts, [])
    assert.deepEqual(h.manager.calls, [])
  }
})

test('poller: get ném lỗi bất ngờ → không ném ra ngoài và lần sau vẫn chạy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zalo-acc-'))
  let n = 0
  const poller = new AccountRequestsPoller({
    get: async () => { n++; throw new Error('boom') },
    post: async () => ({ status: 200 }),
    manager: fakeManager(),
    accountsDir: dir,
    login: async () => ({ credentials: {} }),
    logger: silentLogger,
  })
  await poller.poll()
  await poller.poll()
  assert.equal(n, 2)
})
