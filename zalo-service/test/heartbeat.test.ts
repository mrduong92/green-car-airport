import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat } from '../src/heartbeat.js'
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
        { id: 'acc1', connected: true, logged_in: true, last_error: null },
        { id: 'acc2', connected: false, logged_in: false, last_error: 'timeout' },
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
