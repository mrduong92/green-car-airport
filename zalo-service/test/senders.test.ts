import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { SenderStore } from '../src/senders.js'

test('qr info round-trip; unknown sender returns nulls; errors keep the old code', () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO senders (uid, display_name) VALUES ('111', 'Đức')").run()
  const senders = new SenderStore(db)

  assert.deepEqual(senders.qr('111'), { code: null, fetchedAt: null, status: null })
  senders.saveQr('111', '758z6tl22yft', 'ok', 5000)
  assert.deepEqual(senders.qr('111'), { code: '758z6tl22yft', fetchedAt: 5000, status: 'ok' })
  senders.saveQr('111', null, 'error', 6000)
  assert.deepEqual(senders.qr('111'), { code: '758z6tl22yft', fetchedAt: 6000, status: 'error' })
  assert.deepEqual(senders.qr('999'), { code: null, fetchedAt: null, status: null })
})

test('qrStats counts senders by status fetched since a time', () => {
  const db = openDb(':memory:')
  const senders = new SenderStore(db)
  for (const uid of ['a', 'b', 'c', 'd', 'e', 'f']) db.prepare("INSERT INTO senders (uid, display_name) VALUES (?, '')").run(uid)
  senders.saveQr('a', 'c1', 'ok', 5000)
  senders.saveQr('b', 'c2', 'ok', 5000)
  senders.saveQr('c', null, 'empty', 5000)
  senders.saveQr('d', null, 'error', 5000)
  senders.saveQr('e', 'old', 'ok', 1000) // trước mốc → không tính
  // 'f' chưa từng lấy mã → không tính
  assert.deepEqual(senders.qrStats(2000), { ok: 2, empty: 1, error: 1 })
})
