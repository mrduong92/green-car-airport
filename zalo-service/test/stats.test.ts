import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { computeStats, formatStats } from '../src/stats.js'

const HOUR = 3_600_000
const T0 = 1_730_000_000_000

test('reports duplicates, timed share and top groups', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const base = { group_name: '', sender_name: '', sent_at: T0 }
  store.save({ ...base, group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: '1', sender_uid: 's1', content: 'tiễn 4h15 phố cổ ck 200' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '2', sender_uid: 's2', content: 'chào cả nhà' }, 'acc1')
  store.save({ ...base, group_id: 'g2', msg_id: '3', sender_uid: 's1', content: 'tiễn 4h15 phố cổ ck 200' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '4', sender_uid: 's3', content: 'đón T1 12:30 về Hà Đông' }, 'acc1')
  store.save({ ...base, group_id: 'g1', msg_id: '5', sender_uid: 's4', content: 'tin cũ', sent_at: T0 - 72 * HOUR }, 'acc1')

  const report = computeStats(db, 24, T0 + 60_000)

  assert.equal(report.total, 4)
  assert.equal(report.duplicates, 1)
  assert.equal(report.unique, 3)
  assert.equal(report.timed, 2)
  assert.equal(report.senders, 3)
  assert.equal(report.groups, 2)
  assert.deepEqual(report.topGroups[0], { name: 'Taxi Nội Bài', total: 3 })
  assert.deepEqual(report.topGroups[1], { name: 'g2', total: 1 })

  const text = formatStats(report, 24)
  assert.match(text, /Tin trùng \(bỏ qua\): 1 \(25\.0%\)/)
  assert.match(text, /có dấu hiệu giờ \(giống cuốc\): 2 \(66\.7%\)/)
})

test('formatStats with no data says so', () => {
  const db = openDb(':memory:')
  assert.match(formatStats(computeStats(db, 24), 24), /Chưa có tin nào/)
})
