import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { SenderStore } from '../src/senders.js'
import { latestMessages } from '../src/latest.js'

const HOUR = 3_600_000

test('latest messages come newest first with the sender deep link', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const base = { group_id: 'g1', group_name: 'Taxi Nội Bài', sender_name: 'Đức' }
  store.save({ ...base, msg_id: 'a', sender_uid: '111', content: 'tiễn 5h phố cổ', sent_at: 1000 }, 'acc1')
  store.save({ ...base, msg_id: 'b', sender_uid: '222', sender_name: 'Hà', content: 'đón T1 9h', sent_at: 2000 }, 'acc1')
  new SenderStore(db).saveQr('111', '758z6tl22yft', 'ok', 3000)

  assert.deepEqual(latestMessages(db, 10), [
    { sent_at: 2000, group_name: 'Taxi Nội Bài', sender_uid: '222', sender_name: 'Hà', content: 'đón T1 9h', parse_status: 'pending', deep_link: null, qr_status: null },
    { sent_at: 1000, group_name: 'Taxi Nội Bài', sender_uid: '111', sender_name: 'Đức', content: 'tiễn 5h phố cổ', parse_status: 'pending', deep_link: 'zalo://qr/p/758z6tl22yft', qr_status: 'ok' },
  ])
  assert.equal(latestMessages(db, 1).length, 1)
})
