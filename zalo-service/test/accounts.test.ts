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
