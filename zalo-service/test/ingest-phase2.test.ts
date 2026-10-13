import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { GroupNames } from '../src/groups.js'
import { createIngestor, newCounters } from '../src/ingest.js'
import type { Processor } from '../src/processor.js'

const HOUR = 3_600_000

test('stored messages go to the processor; duplicates bump the original', async () => {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const stored: number[] = []
  const dups: string[] = []
  const processor = { handleStored: (id: number) => stored.push(id), handleDuplicate: (uid: string, content: string) => dups.push(`${uid}:${content}`) } as unknown as Processor
  const ingest = createIngestor({ store, groups: new GroupNames({ fetchName: async () => '' }), counters: newCounters(), processor })
  const msg = (msgId: string, threadId: string) => ({ type: 1, isSelf: false, threadId, data: { msgId, uidFrom: '111', ts: '1730000000000', content: 'tiễn 5h phố cổ' } })

  await ingest('acc1', msg('1', 'g1'))
  await ingest('acc1', msg('2', 'g2'))
  await ingest('acc2', msg('1', 'g1'))

  assert.deepEqual(stored, [store.findId('g1', '1')])
  assert.deepEqual(dups, ['111:tiễn 5h phố cổ'])
})
