import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/db.js'
import { pruneLeftGroups, pruneRemovedSessions, pruneStaleSenders } from '../src/cleanup.js'

const DAY = 24 * 3_600_000
const NOW = Date.UTC(2026, 9, 10, 3, 0)

test('xoá file session đã gỡ (.json.removed-<ms>) quá hạn, giữ file mới gỡ và session đang dùng', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zalo-removed-'))
  writeFileSync(join(dir, 'acc1.json'), '{}')
  writeFileSync(join(dir, `acc2.json.removed-${NOW - 8 * DAY}`), '{"cookie":[]}')
  writeFileSync(join(dir, `acc3.json.removed-${NOW - 6 * DAY}`), '{"cookie":[]}')
  writeFileSync(join(dir, 'acc4.json.removed-abc'), '{}') // tên lạ → không đụng
  writeFileSync(join(dir, 'ghi-chu.txt'), 'x')

  const deleted = pruneRemovedSessions(dir, NOW, 7 * DAY)

  assert.equal(deleted, 1)
  assert.deepEqual(readdirSync(dir).sort(), ['acc1.json', `acc3.json.removed-${NOW - 6 * DAY}`, 'acc4.json.removed-abc', 'ghi-chu.txt'].sort())
})

test('thư mục session chưa tồn tại → không lỗi, xoá 0', () => {
  assert.equal(pruneRemovedSessions(join(tmpdir(), 'khong-co-' + NOW), NOW, 7 * DAY), 0)
})

test('xoá nhóm đã rời quá hạn cùng dấu group_accounts, giữ nhóm mới rời và nhóm còn ở', () => {
  const db = openDb(':memory:')
  const add = db.prepare('INSERT INTO chat_groups (zalo_group_id, name, left_at) VALUES (?, ?, ?)')
  add.run('old', 'Rời lâu', NOW - 31 * DAY)
  add.run('recent', 'Mới rời', NOW - 5 * DAY)
  add.run('active', 'Đang ở', null)
  const mark = db.prepare('INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES (?, ?, ?)')
  mark.run('old', 'acc1', NOW - 40 * DAY)
  mark.run('active', 'acc1', NOW)

  const result = pruneLeftGroups(db, NOW, 30 * DAY)

  assert.deepEqual(result, { groups: 1, groupAccounts: 1 })
  const ids = (db.prepare('SELECT zalo_group_id FROM chat_groups ORDER BY zalo_group_id').all() as { zalo_group_id: string }[]).map((r) => r.zalo_group_id)
  assert.deepEqual(ids, ['active', 'recent'])
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM group_accounts').get() as { n: number }).n, 1)
})

test('xoá người bắn lâu không thấy và không còn cuốc còn hạn; giữ người còn cuốc còn hạn hoặc mới thấy', () => {
  const db = openDb(':memory:')
  const add = db.prepare('INSERT INTO senders (uid, display_name, last_seen_at) VALUES (?, ?, ?)')
  add.run('stale', 'Cũ', NOW - 31 * DAY)
  add.run('stale-null', 'Chưa thấy', null)
  add.run('stale-with-ride', 'Cũ còn cuốc', NOW - 31 * DAY)
  add.run('stale-expired-ride', 'Cũ cuốc hết hạn', NOW - 31 * DAY)
  add.run('fresh', 'Mới', NOW - 2 * DAY)
  const ride = db.prepare(`INSERT INTO rides (ride_uid, message_id, sender_uid, zalo_group_id, raw_text, fingerprint, posted_at, expires_at, updated_at)
    VALUES (?, 1, ?, 'g1', 'x', ?, ?, ?, ?)`)
  ride.run('r1', 'stale-with-ride', 'f1', NOW, NOW + DAY, NOW)
  ride.run('r2', 'stale-expired-ride', 'f2', NOW - 2 * DAY, NOW - DAY, NOW)

  const deleted = pruneStaleSenders(db, NOW, 30 * DAY)

  assert.equal(deleted, 3)
  const uids = (db.prepare('SELECT uid FROM senders ORDER BY uid').all() as { uid: string }[]).map((r) => r.uid)
  assert.deepEqual(uids, ['fresh', 'stale-with-ride'])
})
