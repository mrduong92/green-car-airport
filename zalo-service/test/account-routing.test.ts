import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { accountsForSender, accountsForGroup, tryAccounts } from '../src/account-routing.js'

function db() {
  const d = openDb(':memory:')
  const ins = d.prepare(`INSERT INTO messages (zalo_group_id, zalo_msg_id, sender_uid, account_id, content, content_hash, sent_at, received_at)
    VALUES (?, ?, ?, ?, 'x', ?, ?, ?)`)
  ins.run('g1', 'm1', 'u1', 'acc1', 'h1', 1, 1)
  ins.run('g2', 'm2', 'u1', 'acc2', 'h2', 5, 5)
  ins.run('g2', 'm3', 'u2', 'acc2', 'h3', 3, 3)
  d.prepare("INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES ('g2', 'acc2', 1), ('g3', 'acc1', 1)").run()
  return d
}

test('accountsForSender puts the account that received the sender most recently first, then the rest', () => {
  assert.deepEqual(accountsForSender(db(), 'u1', ['acc1', 'acc2', 'acc3']), ['acc2', 'acc1', 'acc3'])
  assert.deepEqual(accountsForSender(db(), 'u2', ['acc1', 'acc2']), ['acc2', 'acc1'])
  assert.deepEqual(accountsForSender(db(), 'unknown', ['acc1', 'acc2']), ['acc1', 'acc2'])
})

test('accountsForSender ignores accounts that are not logged in', () => {
  assert.deepEqual(accountsForSender(db(), 'u1', ['acc1']), ['acc1'])
})

test('accountsForGroup puts accounts that are in the group first', () => {
  assert.deepEqual(accountsForGroup(db(), 'g2', ['acc1', 'acc2']), ['acc2', 'acc1'])
  assert.deepEqual(accountsForGroup(db(), 'g3', ['acc2', 'acc1']), ['acc1', 'acc2'])
})

test('tryAccounts returns the first success and throws the last error when all fail', async () => {
  const calls: string[] = []
  const ok = await tryAccounts(['a', 'b', 'c'], async (id) => { calls.push(id); if (id === 'a') throw new Error('Tham số không hợp lệ'); return id })
  assert.equal(ok, 'b')
  assert.deepEqual(calls, ['a', 'b'])
  await assert.rejects(tryAccounts(['a'], async () => { throw new Error('hỏng') }), /hỏng/)
  await assert.rejects(tryAccounts([], async () => 'x'), /Chưa có tài khoản nào đăng nhập/)
})
