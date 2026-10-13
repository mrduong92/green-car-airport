import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { GroupNames } from '../src/groups.js'
import { createIngestor, newCounters } from '../src/ingest.js'

const HOUR = 3_600_000

function setup(allowedGroupIds: string[]) {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const counters = newCounters()
  const qrRequests: string[] = []
  const ingest = createIngestor({
    store, groups: new GroupNames({ fetchName: async () => '' }), counters,
    allowedGroupIds: new Set(allowedGroupIds), onSender: (uid) => qrRequests.push(uid),
  })
  const msg = (msgId: string, threadId: string, uid = '111') =>
    ({ type: 1, isSelf: false, threadId, data: { msgId, uidFrom: uid, ts: '1730000000000', content: 'tiễn 5h phố cổ' } })
  return { db, counters, qrRequests, ingest, msg }
}

test('only messages from allowed groups are stored', async () => {
  const h = setup(['g1'])
  assert.equal(await h.ingest('acc1', h.msg('1', 'g1')), 'stored')
  assert.equal(await h.ingest('acc1', h.msg('2', 'g2')), 'other_group')
  assert.equal((h.db.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number }).c, 1)
  assert.equal(h.counters.skippedOtherGroup, 1)
})

test('an empty allow-list keeps every group', async () => {
  const h = setup([])
  assert.equal(await h.ingest('acc1', h.msg('1', 'g9')), 'stored')
})

test('every stored or duplicate sender is handed over for QR lookup', async () => {
  const h = setup(['g1'])
  await h.ingest('acc1', h.msg('1', 'g1', '111'))
  await h.ingest('acc1', h.msg('2', 'g1', '111')) // trùng nội dung, vẫn cần mã
  await h.ingest('acc2', h.msg('1', 'g1', '111')) // tài khoản khác nghe cùng tin → ignored
  assert.deepEqual(h.qrRequests, ['111', '111'])
})
