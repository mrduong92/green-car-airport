import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import type { MessageItem } from '../src/normalize.js'

const HOUR = 3_600_000
const T0 = 1_730_000_000_000
let seq = 0

function item(overrides: Partial<MessageItem> = {}): MessageItem {
  seq++
  return {
    group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: String(1000 + seq), sender_uid: '111',
    sender_name: 'Hoàng Anh Đức', content: `tiễn 4h15 phố cổ ck 200 #${seq}`, sent_at: T0, ...overrides,
  }
}

function setup() {
  const db = openDb(':memory:')
  const store = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c
  return { db, store, count }
}

test('stores a message with its group and sender', () => {
  const { db, store, count } = setup()
  assert.equal(store.save(item(), 'acc1', T0), 'stored')
  assert.equal(count("SELECT COUNT(*) AS c FROM messages WHERE parse_status = 'pending' AND account_id = 'acc1'"), 1)
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  assert.deepEqual(db.prepare('SELECT display_name FROM senders').get(), { display_name: 'Hoàng Anh Đức' })
})

test('same message heard by two accounts is stored once', () => {
  const { store, count } = setup()
  const m = item()
  assert.equal(store.save(m, 'acc1'), 'stored')
  assert.equal(store.save(m, 'acc2'), 'ignored')
  assert.equal(count('SELECT COUNT(*) AS c FROM messages'), 1)
})

test('reformatted repost in another group within 24h is duplicate', () => {
  const { store } = setup()
  assert.equal(store.save(item({ content: 'tiễn 5h Tràng An 200k' }), 'acc1'), 'stored')
  assert.equal(store.save(item({ group_id: 'g2', content: 'Tiễn  5h tràng an\n200k', sent_at: T0 + HOUR }), 'acc1'), 'duplicate')
})

test('same content from a different sender is not duplicate', () => {
  const { store } = setup()
  store.save(item({ content: 'tiễn 5h Tràng An 200k' }), 'acc1')
  assert.equal(store.save(item({ content: 'tiễn 5h Tràng An 200k', sender_uid: '222' }), 'acc1'), 'stored')
})

test('repost after the window is not duplicate', () => {
  const { store } = setup()
  store.save(item({ content: 'tiễn 6h Mỹ Đình' }), 'acc1')
  assert.equal(store.save(item({ content: 'tiễn 6h Mỹ Đình', sent_at: T0 + 25 * HOUR }), 'acc1'), 'stored')
})

test('long content and names are truncated, not rejected', () => {
  const { db, store } = setup()
  assert.equal(store.save(item({ content: 'a'.repeat(5000), group_name: 'n'.repeat(400), sender_name: 's'.repeat(400) }), 'acc1'), 'stored')
  assert.equal((db.prepare('SELECT length(content) AS l FROM messages').get() as { l: number }).l, 4000)
  assert.equal((db.prepare('SELECT length(name) AS l FROM chat_groups').get() as { l: number }).l, 255)
  assert.equal((db.prepare('SELECT length(display_name) AS l FROM senders').get() as { l: number }).l, 255)
})

test('empty group name keeps the known name; a new name renames', () => {
  const { db, store } = setup()
  store.save(item({ group_name: 'Taxi Nội Bài' }), 'acc1')
  store.save(item({ group_name: '' }), 'acc1')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài' })
  store.save(item({ group_name: 'Taxi Nội Bài 24/7' }), 'acc1')
  assert.deepEqual(db.prepare('SELECT name FROM chat_groups').get(), { name: 'Taxi Nội Bài 24/7' })
})

test('prune deletes only messages older than retention', () => {
  const { store, count } = setup()
  store.save(item({ sent_at: T0 - 8 * 24 * HOUR }), 'acc1')
  store.save(item({ sent_at: T0 - 6 * 24 * HOUR }), 'acc1')
  assert.equal(store.prune(T0), 1)
  assert.equal(count('SELECT COUNT(*) AS c FROM messages'), 1)
})
