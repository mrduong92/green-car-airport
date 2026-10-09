import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AccountManager, type ApiLike } from '../src/accounts.js'
import { silentLogger } from '../src/logger.js'

class FakeListener extends EventEmitter {
  started = false
  stopped = false
  start() { this.started = true; this.stopped = false }
  stop() { this.stopped = true }
}

type FakeApi = ApiLike & { listener: FakeListener }

function fakeApi(uid = 'own', getUserInfo?: ApiLike['getUserInfo']): FakeApi {
  return {
    listener: new FakeListener(), getOwnId: () => uid, getGroupInfo: async () => ({}),
    getAllGroups: async () => ({ gridVerMap: {} }), getQR: async () => ({}), getUserInfo,
  }
}

function harness(loginImpl: (credentials: unknown) => Promise<ApiLike>, accounts = [{ id: 'acc1', credentials: 'c1' }]) {
  const scheduled: (() => void)[] = []
  const received: [string, unknown][] = []
  let clock = 1_000
  const manager = new AccountManager({
    accounts,
    login: loginImpl,
    onMessage: (id, m) => received.push([id, m]),
    logger: silentLogger,
    retryMs: 10,
    schedule: (fn) => { scheduled.push(fn) },
    now: () => clock,
  })
  return { manager, scheduled, received, setClock: (t: number) => { clock = t } }
}

const tick = () => new Promise((r) => setImmediate(r))

test('add: chạy nick mới ngay, không cần restart', async () => {
  const apis: FakeApi[] = []
  const { manager, received } = harness(async () => { const a = fakeApi(); apis.push(a); return a }, [])
  await manager.startAll()
  assert.deepEqual(manager.snapshot(), [])

  await manager.add({ id: 'acc9', credentials: 'c9' })
  assert.equal(manager.snapshot()[0].id, 'acc9')
  assert.equal(manager.snapshot()[0].loggedIn, true)
  assert.ok(apis[0].listener.started)
  apis[0].listener.emit('message', { m: 1 })
  assert.deepEqual(received, [['acc9', { m: 1 }]])
})

test('add với id đã có: dừng listener cũ, chỉ còn một api cho id đó', async () => {
  const apis: FakeApi[] = []
  const { manager, received } = harness(async () => { const a = fakeApi(); apis.push(a); return a })
  await manager.startAll()
  const old = apis[0]

  await manager.add({ id: 'acc1', credentials: 'c1-new' })
  assert.equal(old.listener.stopped, true)
  assert.equal(apis.length, 2)
  assert.equal(manager.snapshot().length, 1)
  assert.equal(manager.loggedIn().length, 1)
  assert.equal(manager.loggedIn()[0].api, apis[1])

  // Listener cũ có phát sự kiện muộn cũng bị bỏ qua: không nhận tin, không đăng nhập lại.
  old.listener.emit('message', { stale: true })
  old.listener.emit('closed', 3000, 'bye')
  assert.deepEqual(received, [])
  assert.equal(manager.snapshot()[0].loggedIn, true)
})

test('remove: dừng listener, bỏ khỏi snapshot / loggedIn / info', async () => {
  const api = fakeApi()
  const { manager } = harness(async () => api)
  await manager.startAll()
  assert.ok(manager.info('acc1'))

  manager.remove('acc1')
  assert.equal(api.listener.stopped, true)
  assert.deepEqual(manager.snapshot(), [])
  assert.deepEqual(manager.loggedIn(), [])
  assert.equal(manager.anyApi(), undefined)
  assert.equal(manager.info('acc1'), undefined)
  // Gỡ nick không có → không ném
  manager.remove('nope')
})

test('remove huỷ lượt đăng nhập lại đã hẹn giờ của nick đó', async () => {
  let logins = 0
  const { manager, scheduled } = harness(async () => { logins++; throw new Error('phiên hết hạn') })
  await manager.startAll()
  assert.equal(scheduled.length, 1)

  manager.remove('acc1')
  scheduled[0]()
  await tick()
  assert.equal(logins, 1)
  assert.deepEqual(manager.snapshot(), [])
})

test('remove huỷ cả lượt mở lại socket nhanh (mã 1000) đã hẹn giờ', async () => {
  const api = fakeApi()
  const { manager, scheduled } = harness(async () => api)
  await manager.startAll()
  api.listener.started = false
  api.listener.emit('closed', 1000, '')
  assert.equal(scheduled.length, 1)

  manager.remove('acc1')
  scheduled[0]()
  assert.equal(api.listener.started, false)
})

test('remove khi nick đang đăng nhập dở: đăng nhập xong cũng không chạy listener', async () => {
  let resolveLogin!: (api: ApiLike) => void
  const api = fakeApi()
  const { manager } = harness(() => new Promise((r) => { resolveLogin = r }))
  const starting = manager.startAll()
  manager.remove('acc1')
  resolveLogin(api)
  await starting
  assert.equal(api.listener.started, false)
  assert.deepEqual(manager.snapshot(), [])
})

test('info: UID, tên Zalo (getUserInfo của chính mình), lúc đăng nhập', async () => {
  const asked: unknown[] = []
  const api = fakeApi('123', async (uid) => {
    asked.push(uid)
    return { changed_profiles: { '123_0': { displayName: 'Nick Phụ 1', zaloName: 'nickphu1' } } }
  })
  const { manager, setClock } = harness(async () => api)
  setClock(42_000)
  await manager.startAll()
  assert.deepEqual(asked, ['123'])
  assert.deepEqual(manager.info('acc1'), { zaloUid: '123', zaloName: 'Nick Phụ 1', loggedInAt: 42_000 })
})

test('info: lấy tên lỗi → tên rỗng, đăng nhập vẫn OK', async () => {
  const api = fakeApi('123', async () => { throw new Error('zalo lỗi') })
  const { manager } = harness(async () => api)
  await manager.startAll()
  assert.equal(manager.snapshot()[0].loggedIn, true)
  assert.deepEqual(manager.info('acc1'), { zaloUid: '123', zaloName: '', loggedInAt: 1_000 })
})

test('info: chưa đăng nhập được → không có', async () => {
  const { manager } = harness(async () => { throw new Error('x') })
  await manager.startAll()
  assert.equal(manager.info('acc1'), undefined)
})
