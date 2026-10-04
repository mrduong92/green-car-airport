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
