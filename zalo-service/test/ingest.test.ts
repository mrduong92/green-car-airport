import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { GroupNames } from '../src/groups.js'
import { createIngestor, newCounters } from '../src/ingest.js'
import type { IncomingMessage } from '../src/normalize.js'

const HOUR = 3_600_000

function setup() {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const groups = new GroupNames({ fetchName: async () => 'Taxi Nội Bài' })
  const counters = newCounters()
  const ingest = createIngestor({ store, groups, counters, now: () => 5_000 })
  return { db, ingest, counters }
}

function msg(msgId: string, content: unknown = 'tiễn 4h15 phố cổ'): IncomingMessage {
  return { type: 1, isSelf: false, threadId: 'g1', data: { msgId, uidFrom: '111', dName: 'Đức', ts: '1730000000000', content } }
}

test('stores a group text with the group name looked up', async () => {
  const { db, ingest, counters } = setup()
  assert.equal(await ingest('acc1', msg('1')), 'stored')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  assert.deepEqual(
    { received: counters.received, stored: counters.stored, lastMessageAt: counters.lastMessageAt },
    { received: 1, stored: 1, lastMessageAt: 5_000 },
  )
})

test('a second account hearing the same message counts as ignored', async () => {
  const { ingest, counters } = setup()
  await ingest('acc1', msg('1'))
  assert.equal(await ingest('acc2', msg('1')), 'ignored')
  assert.equal(counters.ignored, 1)
  assert.equal(counters.stored, 1)
})

test('duplicates are stored and counted', async () => {
  const { ingest, counters } = setup()
  await ingest('acc1', msg('1', 'đón T1 về Hà Đông 300k'))
  assert.equal(await ingest('acc1', { ...msg('2', 'đón T1 về Hà Đông 300k'), threadId: 'g2' }), 'duplicate')
  assert.equal(counters.stored, 2)
  assert.equal(counters.duplicates, 1)
})

test('non-text messages are skipped and counted', async () => {
  const { ingest, counters } = setup()
  assert.equal(await ingest('acc1', msg('1', { href: 'a.jpg' })), 'non_text')
  assert.equal(counters.skippedNonText, 1)
  assert.equal(counters.lastMessageAt, null)
})
