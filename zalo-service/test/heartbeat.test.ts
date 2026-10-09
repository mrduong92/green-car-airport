import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat, heartbeatAccounts } from '../src/heartbeat.js'
import { openDb } from '../src/db.js'
import { accountGroupCounts, forgetAccount } from '../src/group-scanner.js'
import { newCounters } from '../src/ingest.js'

// Cắt theo đơn vị UTF-16 có thể để lại nửa emoji (surrogate lẻ) → JSON gửi Laravel có "\ud83d" lẻ,
// PHP json_decode từ chối CẢ LÔ heartbeat → service trông như đã chết. Khớp test/truncate.test.ts.
const hasLoneSurrogate = (s: string) =>
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)

test('builds the payload expected by Laravel', () => {
  const counters = { ...newCounters(), received: 10, stored: 8, duplicates: 3, ignored: 1, skippedNonText: 1, lastMessageAt: 9_000 }
  assert.deepEqual(
    buildHeartbeat({
      serviceId: 'zalo-1', startedAt: 0, now: 125_400, counters,
      accounts: [
        { id: 'acc1', connected: true, loggedIn: true },
        { id: 'acc2', connected: false, loggedIn: false, lastError: 'timeout' },
      ],
    }),
    {
      service_id: 'zalo-1', uptime_s: 125,
      accounts: [
        { id: 'acc1', connected: true, logged_in: true, last_error: null, zalo_uid: null, zalo_name: null, logged_in_at: null, groups: 0 },
        { id: 'acc2', connected: false, logged_in: false, last_error: 'timeout', zalo_uid: null, zalo_name: null, logged_in_at: null, groups: 0 },
      ],
      received_total: 10, stored_total: 8, duplicates_total: 3, skipped_non_text: 1, last_message_at: 9_000,
    },
  )
})

// Lỗi đăng nhập/socket đôi khi là cả một stack trace — không cắt thì Laravel 422 từ chối CẢ GÓI
// heartbeat (service trông như đã chết, không có cảnh báo nào). 300 ký tự (code point) là đủ để chẩn đoán.
test('last_error over 2000 code points is truncated to 300 without splitting an emoji', () => {
  // UTF-16 index 299 rơi đúng vào nửa đầu emoji đầu tiên — bẫy cho cách cắt theo .slice() ngây thơ.
  const longError = 'x'.repeat(299) + '🚗'.repeat(1701)
  assert.equal(Array.from(longError).length, 2000)

  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(),
    accounts: [{ id: 'acc1', connected: true, loggedIn: false, lastError: longError }],
  })

  const lastError = payload.accounts[0].last_error as string
  assert.ok(Array.from(lastError).length <= 300, `expected <= 300 code points, got ${Array.from(lastError).length}`)
  assert.ok(!hasLoneSurrogate(lastError))
})

// Giai đoạn 5 (tab "Nick Zalo"): mỗi nick kèm UID, tên Zalo, lúc đăng nhập, số nhóm.
test('each account carries zalo_uid, zalo_name, logged_in_at and groups', () => {
  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(),
    accounts: [{ id: 'acc1', connected: true, loggedIn: true, zaloUid: '123', zaloName: 'Nick 1', loggedInAt: 500, groups: 42 }],
  })
  assert.deepEqual(payload.accounts[0], {
    id: 'acc1', connected: true, logged_in: true, last_error: null,
    zalo_uid: '123', zalo_name: 'Nick 1', logged_in_at: 500, groups: 42,
  })
})

test('zalo_name is truncated to 100 code points', () => {
  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(),
    accounts: [{ id: 'acc1', connected: true, loggedIn: true, zaloName: '🚗'.repeat(500) }],
  })
  const name = payload.accounts[0].zalo_name as string
  assert.ok(Array.from(name).length <= 100)
  assert.ok(!hasLoneSurrogate(name))
})

test('heartbeatAccounts merges snapshot, manager info and group counts', () => {
  const accounts = heartbeatAccounts(
    [{ id: 'acc1', connected: true, loggedIn: true }, { id: 'acc2', connected: false, loggedIn: false, lastError: 'x' }],
    (id) => (id === 'acc1' ? { zaloUid: '1', zaloName: 'A', loggedInAt: 9 } : undefined),
    new Map([['acc1', 3]]),
  )
  assert.deepEqual(accounts, [
    { id: 'acc1', connected: true, loggedIn: true, zaloUid: '1', zaloName: 'A', loggedInAt: 9, groups: 3 },
    { id: 'acc2', connected: false, loggedIn: false, lastError: 'x', groups: 0 },
  ])
})

test('accountGroupCounts counts group_accounts rows per account', () => {
  const db = openDb(':memory:')
  const ins = db.prepare('INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES (?, ?, 0)')
  for (const g of ['g1', 'g2', 'g3']) { db.prepare('INSERT INTO chat_groups (zalo_group_id) VALUES (?)').run(g); ins.run(g, 'acc1') }
  ins.run('g1', 'acc2')
  assert.deepEqual(accountGroupCounts(db), new Map([['acc1', 3], ['acc2', 1]]))
  // Gỡ nick → xoá dấu nhóm của riêng nick đó.
  assert.equal(forgetAccount(db, 'acc1'), 3)
  assert.deepEqual(accountGroupCounts(db), new Map([['acc2', 1]]))
})
