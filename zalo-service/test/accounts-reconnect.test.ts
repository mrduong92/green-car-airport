import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AccountManager, type ApiLike } from '../src/accounts.js'
import { silentLogger } from '../src/logger.js'

class FakeListener extends EventEmitter {
  starts = 0
  start() { this.starts++ }
  stop() {}
}

function setup() {
  const api = { listener: new FakeListener(), getOwnId: () => 'own', getGroupInfo: async () => ({}), getQR: async () => ({}) } satisfies ApiLike
  let logins = 0
  const delays: number[] = []
  const pending: (() => void)[] = []
  const manager = new AccountManager({
    accounts: [{ id: 'acc1', credentials: 'c1' }],
    login: async () => { logins++; return api },
    onMessage: () => {},
    logger: silentLogger,
    retryMs: 60_000,
    schedule: (fn, ms) => { delays.push(ms); pending.push(fn) },
  })
  return { api, manager, delays, pending, logins: () => logins }
}

test('Zalo đóng socket 1000 → mở lại listener ngay trên phiên cũ, không đăng nhập lại', async () => {
  const { api, manager, delays, pending, logins } = setup()
  await manager.startAll()
  api.listener.emit('connected')

  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE')
  assert.deepEqual(delays, [3_000])
  assert.equal(manager.snapshot()[0].loggedIn, true)

  pending.shift()!()
  assert.equal(api.listener.starts, 2)
  assert.equal(logins(), 1)
})

test('bị đá phiên (3000) vẫn đăng nhập lại như cũ', async () => {
  const { api, manager, delays } = setup()
  await manager.startAll()
  api.listener.emit('closed', 3000, 'kicked')
  assert.deepEqual(delays, [60_000])
  assert.equal(manager.snapshot()[0].loggedIn, false)
})

test('mở lại liên tục mà không nhận được tin nào → chuyển sang đăng nhập lại', async () => {
  const { api, manager, delays, pending } = setup()
  await manager.startAll()
  for (let i = 0; i < 5; i++) { api.listener.emit('closed', 1000, 'NORMAL_CLOSURE'); pending.shift()!() }
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE')
  assert.deepEqual(delays, [3_000, 3_000, 3_000, 3_000, 3_000, 60_000])
})

test('có tin đến thì bộ đếm mở lại về 0', async () => {
  const { api, manager, delays, pending } = setup()
  await manager.startAll()
  for (let i = 0; i < 5; i++) { api.listener.emit('closed', 1000, 'NORMAL_CLOSURE'); pending.shift()!() }
  api.listener.emit('message', {})
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE')
  assert.equal(delays.at(-1), 3_000)
})

test('mở lại nhanh (1000) không chiếm lượt thử lại, không tính là lỗi: sau đó bị đá vẫn đăng nhập lại với độ trễ gốc', async () => {
  const { api, manager, delays, pending, logins } = setup()
  await manager.startAll()
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE'); pending.shift()!()
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE'); pending.shift()!()
  api.listener.emit('closed', 3000, 'kicked')
  assert.deepEqual(delays, [3_000, 3_000, 60_000])
  assert.equal(manager.snapshot()[0].loggedIn, false)
  // Đóng trùng sau khi đã lên lịch đăng nhập lại → bỏ qua, kể cả mã 1000.
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE')
  assert.deepEqual(delays, [3_000, 3_000, 60_000])
  pending.pop()!()
  await new Promise((r) => setImmediate(r))
  assert.equal(logins(), 2)
})

test('mở lại nhanh mà listener.start ném lỗi → không sập, chuyển sang đăng nhập lại', async () => {
  const { api, manager, delays, pending } = setup()
  await manager.startAll()
  api.listener.start = () => { throw new Error('ws hỏng') }
  api.listener.emit('closed', 1000, 'NORMAL_CLOSURE')
  assert.doesNotThrow(() => pending.shift()!())
  const state = manager.snapshot()[0]
  assert.equal(state.loggedIn, false)
  assert.match(state.lastError ?? '', /ws hỏng/)
  assert.deepEqual(delays, [3_000, 60_000])
})
