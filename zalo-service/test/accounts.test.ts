import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AccountManager, type ApiLike } from '../src/accounts.js'
import { silentLogger } from '../src/logger.js'

class FakeListener extends EventEmitter {
  started = false
  stopped = false
  start() { this.started = true }
  stop() { this.stopped = true }
}

function fakeApi(): ApiLike & { listener: FakeListener } {
  return { listener: new FakeListener(), getOwnId: () => 'own', getGroupInfo: async () => ({}) }
}

function harness(loginImpl: (credentials: unknown) => Promise<ApiLike>) {
  const scheduled: (() => void)[] = []
  const received: [string, unknown][] = []
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }, { id: 'acc2', credentials: 'c2' }],
    login: loginImpl,
    onMessage: (id, m) => received.push([id, m]),
    logger: silentLogger,
    retryMs: 10,
    schedule: (fn) => { scheduled.push(fn) },
  })
  return { manager, scheduled, received }
}

test('logs in every account, starts listeners and routes messages with the account id', async () => {
  const apis = new Map<unknown, ReturnType<typeof fakeApi>>()
  const { manager, received } = harness(async (c) => { const api = fakeApi(); apis.set(c, api); return api })

  await manager.startAll()
  assert.ok(apis.get('c1')?.listener.started)
  assert.ok(apis.get('c2')?.listener.started)

  apis.get('c2')!.listener.emit('message', { hello: 1 })
  assert.deepEqual(received, [['acc2', { hello: 1 }]])
})

test('connected and disconnected events update the snapshot', async () => {
  const api = fakeApi()
  const { manager } = harness(async () => api)
  await manager.startAll()

  api.listener.emit('connected')
  assert.ok(manager.snapshot().every((s) => s.connected))
  api.listener.emit('disconnected', 1000, 'bye')
  assert.ok(manager.snapshot().every((s) => !s.connected))
})

test('a failing account does not stop the others and is retried', async () => {
  let failAcc2 = true
  const { manager, scheduled } = harness(async (c) => {
    if (c === 'c2' && failAcc2) throw new Error('phiên hết hạn')
    return fakeApi()
  })

  await manager.startAll()
  const [acc1, acc2] = manager.snapshot()
  assert.equal(acc1.loggedIn, true)
  assert.equal(acc2.loggedIn, false)
  assert.equal(acc2.lastError, 'phiên hết hạn')
  assert.equal(scheduled.length, 1)
  assert.ok(manager.anyApi())

  failAcc2 = false
  scheduled[0]()
  await new Promise((r) => setImmediate(r))
  assert.equal(manager.snapshot().find((s) => s.id === 'acc2')?.loggedIn, true)
})

test('a closed listener marks the account down and schedules a re-login', async () => {
  const api = fakeApi()
  const { manager, scheduled } = harness(async () => api)
  await manager.startAll()
  api.listener.emit('connected')

  api.listener.emit('closed', 3000, 'kicked')
  assert.ok(manager.snapshot().every((s) => !s.connected && !s.loggedIn))
  assert.equal(scheduled.length, 2) // cả 2 tài khoản dùng chung fake api trong test này
})

test('stopAll stops every listener', async () => {
  const created: ReturnType<typeof fakeApi>[] = []
  const { manager } = harness(async () => { const api = fakeApi(); created.push(api); return api })
  await manager.startAll()
  manager.stopAll()
  assert.ok(created.every((a) => a.listener.stopped))
})

test('repeated login failures back off exponentially up to a cap, and reset after success', async () => {
  const delays: number[] = []
  const pending: (() => void)[] = []
  let fail = true
  const api = fakeApi()
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }],
    login: async () => { if (fail) throw new Error('bị khoá'); return api },
    onMessage: () => {},
    logger: silentLogger,
    retryMs: 10,
    maxRetryMs: 50,
    schedule: (fn, ms) => { delays.push(ms); pending.push(fn) },
  })
  const tick = () => new Promise((r) => setImmediate(r))

  await manager.startAll()
  for (let i = 0; i < 4; i++) { pending.shift()!(); await tick() }
  assert.deepEqual(delays, [10, 20, 40, 50, 50])

  // Đăng nhập được nhưng chưa chứng minh phiên ổn định → chưa đếm lại từ đầu.
  fail = false
  pending.shift()!(); await tick()
  api.listener.emit('connected')
  api.listener.emit('message', { hello: 1 })
  api.listener.emit('closed', 3000, 'kicked')
  assert.equal(delays.at(-1), 10)
})

function cycleHarness(opts: { stableMs?: number } = {}) {
  const delays: number[] = []
  const pending: (() => void)[] = []
  const apis: ReturnType<typeof fakeApi>[] = []
  let clock = 0
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }],
    login: async () => { const api = fakeApi(); apis.push(api); return api },
    onMessage: () => {},
    logger: silentLogger,
    retryMs: 10,
    maxRetryMs: 80,
    stableMs: opts.stableMs ?? 1000,
    now: () => clock,
    schedule: (fn, ms) => { delays.push(ms); pending.push(fn) },
  })
  const tick = () => new Promise((r) => setImmediate(r))
  return { manager, delays, pending, apis, tick, advance: (ms: number) => { clock += ms } }
}

test('login OK nhưng listener đóng ngay, lặp lại → backoff vẫn tăng dần tới trần', async () => {
  const { manager, delays, pending, apis, tick } = cycleHarness()
  await manager.startAll()
  for (let i = 0; i < 5; i++) {
    apis.at(-1)!.listener.emit('connected')
    apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
    pending.shift()!(); await tick()
  }
  assert.deepEqual(delays, [10, 20, 40, 80, 80])
})

test('phiên giữ kết nối quá stableMs thì đếm lỗi lại từ đầu', async () => {
  const { manager, delays, pending, apis, tick, advance } = cycleHarness({ stableMs: 1000 })
  await manager.startAll()
  for (let i = 0; i < 3; i++) {
    apis.at(-1)!.listener.emit('connected')
    apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
    pending.shift()!(); await tick()
  }
  assert.deepEqual(delays, [10, 20, 40])

  apis.at(-1)!.listener.emit('connected')
  advance(999)
  apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
  assert.equal(delays.at(-1), 80) // chưa đủ cửa sổ ổn định
  pending.shift()!(); await tick()

  apis.at(-1)!.listener.emit('connected')
  advance(1000)
  apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
  assert.equal(delays.at(-1), 10)
})

test('nhận được tin đầu tiên cũng coi là phiên khoẻ → đếm lỗi lại từ đầu', async () => {
  const { manager, delays, pending, apis, tick } = cycleHarness()
  await manager.startAll()
  for (let i = 0; i < 3; i++) {
    apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
    pending.shift()!(); await tick()
  }
  apis.at(-1)!.listener.emit('connected')
  apis.at(-1)!.listener.emit('message', { a: 1 })
  apis.at(-1)!.listener.emit('closed', 3000, 'kicked')
  assert.deepEqual(delays, [10, 20, 40, 10])
})

test('một lần đăng nhập chỉ lên lịch thử lại tối đa một lần, listener cũ không kích thêm', async () => {
  const { manager, delays, pending, apis, tick } = cycleHarness()
  await manager.startAll()
  const first = apis[0]
  first.listener.emit('closed', 3000, 'kicked')
  first.listener.emit('closed', 3000, 'kicked again')
  assert.equal(delays.length, 1)

  pending.shift()!(); await tick()
  first.listener.emit('closed', 3000, 'stale')
  assert.equal(delays.length, 1)
  assert.equal(manager.snapshot()[0].loggedIn, true)
})

test('đăng nhập treo quá loginTimeoutMs → tính là lỗi, lên lịch thử lại, tài khoản khác không ảnh hưởng', async () => {
  const scheduled: number[] = []
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }, { id: 'acc2', credentials: 'c2' }],
    login: (c) => (c === 'c1' ? new Promise<ApiLike>(() => {}) : Promise.resolve(fakeApi())),
    onMessage: () => {},
    logger: silentLogger,
    retryMs: 10,
    loginTimeoutMs: 20,
    schedule: (_fn, ms) => { scheduled.push(ms) },
  })

  await manager.startAll()
  const [acc1, acc2] = manager.snapshot()
  assert.equal(acc1.loggedIn, false)
  assert.match(acc1.lastError ?? '', /quá thời gian/)
  assert.deepEqual(scheduled, [10])
  assert.equal(acc2.loggedIn, true)
})

test('listener.start ném lỗi sau khi đăng nhập → không sập, lên lịch thử lại, tài khoản khác không ảnh hưởng', async () => {
  const unhandled: unknown[] = []
  const onUnhandled = (err: unknown) => { unhandled.push(err) }
  process.on('unhandledRejection', onUnhandled)
  try {
    let broken = true
    const { manager, scheduled } = harness(async (c) => {
      const api = fakeApi()
      if (c === 'c1' && broken) api.listener.start = () => { throw new Error('ws hỏng') }
      return api
    })

    await manager.startAll()
    const [acc1, acc2] = manager.snapshot()
    assert.equal(acc1.loggedIn, false)
    assert.match(acc1.lastError ?? '', /ws hỏng/)
    assert.equal(scheduled.length, 1)
    assert.equal(acc2.loggedIn, true)

    // Lần thử lại (đường schedule) cũng ném → vẫn không có unhandled rejection, lại lên lịch thử lại.
    scheduled[0]()
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    assert.equal(scheduled.length, 2)
    assert.deepEqual(unhandled, [])

    broken = false
    scheduled[1]()
    await new Promise((r) => setImmediate(r))
    assert.equal(manager.snapshot().find((s) => s.id === 'acc1')?.loggedIn, true)
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})
