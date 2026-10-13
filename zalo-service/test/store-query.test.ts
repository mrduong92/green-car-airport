import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'

const HOUR = 3_600_000

test('find, get, setStatus and idsByStatus', () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const base = { group_id: 'g1', group_name: '', sender_uid: '111', sender_name: '', sent_at: 1000 }
  store.save({ ...base, msg_id: 'a', content: 'tiễn 5h Hà Đông' }, 'acc1')
  store.save({ ...base, msg_id: 'b', content: 'chào cả nhà', sent_at: 5000 }, 'acc1')

  const id = store.findId('g1', 'a')!
  assert.deepEqual(store.get(id), { id, zalo_group_id: 'g1', sender_uid: '111', content: 'tiễn 5h Hà Đông', sent_at: 1000, parse_status: 'pending' })
  assert.equal(store.findId('g1', 'zzz'), undefined)

  store.setStatus(id, 'ai_pending')
  assert.deepEqual(store.idsByStatus('ai_pending', 0), [id])
  assert.deepEqual(store.idsByStatus('pending', 2000), [store.findId('g1', 'b')])
})
