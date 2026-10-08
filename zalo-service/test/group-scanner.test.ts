import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { GroupScanner, pruneUnknownAccounts } from '../src/group-scanner.js'
import { silentLogger } from '../src/logger.js'
import type { ApiLike } from '../src/accounts.js'

function fakeApi(groups: Record<string, { name: string; totalMember: number }>, opts: { fail?: boolean } = {}) {
  const lookups: string[][] = []
  const api = {
    getAllGroups: async () => {
      if (opts.fail) throw new Error('mất kết nối')
      return { gridVerMap: Object.fromEntries(Object.keys(groups).map((id) => [id, '1'])) }
    },
    getGroupInfo: async (ids: string | string[]) => {
      const list = Array.isArray(ids) ? ids : [ids]
      lookups.push(list)
      return { gridInfoMap: Object.fromEntries(list.map((id) => [id, groups[id]])) }
    },
  } as unknown as ApiLike
  return { api, lookups }
}

function setup(accounts: { id: string; api: ApiLike }[], now = 1_000) {
  const db = openDb(':memory:')
  const scanner = new GroupScanner({ db, accounts: () => accounts, logger: silentLogger, now: () => now, sleep: async () => {} })
  return { db, scanner }
}

const groupRow = (db: ReturnType<typeof openDb>, id: string) =>
  db.prepare('SELECT name, member_count, left_at FROM chat_groups WHERE zalo_group_id = ?').get(id) as
    { name: string; member_count: number | null; left_at: number | null } | undefined

test('stores every group of every account with name, member count and which accounts are in it', async () => {
  const a = fakeApi({ g1: { name: 'Taxi Nội Bài', totalMember: 900 }, g2: { name: 'Xe ghép', totalMember: 50 } })
  const b = fakeApi({ g2: { name: 'Xe ghép', totalMember: 50 } })
  const { db, scanner } = setup([{ id: 'acc1', api: a.api }, { id: 'acc2', api: b.api }])

  const result = await scanner.scan()

  assert.deepEqual(result.scanned, ['acc1', 'acc2'])
  assert.deepEqual(groupRow(db, 'g1'), { name: 'Taxi Nội Bài', member_count: 900, left_at: null })
  const accs = db.prepare('SELECT account_id FROM group_accounts WHERE zalo_group_id = ? ORDER BY account_id').all('g2')
  assert.deepEqual(accs, [{ account_id: 'acc1' }, { account_id: 'acc2' }])
})

test('looks names up in batches of at most 20', async () => {
  const groups = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`g${i}`, { name: `N${i}`, totalMember: i }]))
  const a = fakeApi(groups)
  const { scanner } = setup([{ id: 'acc1', api: a.api }])
  await scanner.scan()
  assert.deepEqual(a.lookups.map((l) => l.length), [20, 20, 5])
})

test('known groups are not looked up again', async () => {
  const a = fakeApi({ g1: { name: 'Taxi', totalMember: 10 } })
  const { scanner } = setup([{ id: 'acc1', api: a.api }])
  await scanner.scan()
  await scanner.scan()
  assert.equal(a.lookups.length, 1)
})

test('a group no longer seen by any scanned account is marked left, and un-marked when seen again', async () => {
  // g2 giữ lại: nick bỗng thấy 0 nhóm bị coi là quét lỗi (test riêng bên dưới).
  const groups: Record<string, { name: string; totalMember: number }> = { g1: { name: 'Taxi', totalMember: 10 }, g2: { name: 'Khác', totalMember: 5 } }
  const a = fakeApi(groups)
  const { db, scanner } = setup([{ id: 'acc1', api: a.api }])
  await scanner.scan()
  delete groups.g1
  await scanner.scan()
  assert.equal(groupRow(db, 'g1')?.left_at, 1_000)
  groups.g1 = { name: 'Taxi', totalMember: 10 }
  await scanner.scan()
  assert.equal(groupRow(db, 'g1')?.left_at, null)
})

test('a failed account scan does not mark its groups as left', async () => {
  const ok = fakeApi({ g1: { name: 'A', totalMember: 1 } })
  const flaky = { fail: false }
  const b = fakeApi({ g2: { name: 'B', totalMember: 1 } }, flaky)
  const { db, scanner } = setup([{ id: 'acc1', api: ok.api }, { id: 'acc2', api: b.api }])
  await scanner.scan()
  flaky.fail = true
  const result = await scanner.scan()
  assert.deepEqual(result.failed, ['acc2'])
  assert.equal(groupRow(db, 'g2')?.left_at, null)
})

test('no logged-in account → nothing scanned, nothing marked left', async () => {
  const { db, scanner } = setup([])
  db.prepare("INSERT INTO chat_groups (zalo_group_id, name) VALUES ('g1', 'A')").run()
  const result = await scanner.scan()
  assert.deepEqual(result.scanned, [])
  assert.equal(groupRow(db, 'g1')?.left_at, null)
})

test('an account that suddenly sees 0 groups while it had some is treated as a failed scan', async () => {
  const groups: Record<string, { name: string; totalMember: number }> = { g1: { name: 'Taxi', totalMember: 10 } }
  const a = fakeApi(groups)
  const { db, scanner } = setup([{ id: 'acc1', api: a.api }])
  await scanner.scan()
  delete groups.g1
  const result = await scanner.scan()
  assert.deepEqual(result.failed, ['acc1'])
  assert.deepEqual(result.scanned, [])
  assert.equal(groupRow(db, 'g1')?.left_at, null)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM group_accounts WHERE account_id = 'acc1'").get() as { n: number }).n, 1)
})

test('a missing gridVerMap is treated as a failed scan when the account had groups', async () => {
  const a = fakeApi({ g1: { name: 'Taxi', totalMember: 10 } })
  const { db, scanner } = setup([{ id: 'acc1', api: a.api }])
  await scanner.scan()
  ;(a.api as unknown as { getAllGroups: () => Promise<unknown> }).getAllGroups = async () => ({})
  const result = await scanner.scan()
  assert.deepEqual(result.failed, ['acc1'])
  assert.equal(groupRow(db, 'g1')?.left_at, null)
})

test('an account with no groups before and none now is a normal (successful) scan', async () => {
  const a = fakeApi({})
  const { scanner } = setup([{ id: 'acc1', api: a.api }])
  const result = await scanner.scan()
  assert.deepEqual(result.scanned, ['acc1'])
  assert.deepEqual(result.failed, [])
})

test('pruneUnknownAccounts removes group_accounts rows of accounts no longer configured', async () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO chat_groups (zalo_group_id, name) VALUES ('g1', 'A'), ('g2', 'B')").run()
  db.prepare("INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES ('g1', 'acc1', 1), ('g2', 'old', 1), ('g1', 'old', 1)").run()
  assert.equal(pruneUnknownAccounts(db, ['acc1']), 2)
  assert.deepEqual(db.prepare('SELECT zalo_group_id, account_id FROM group_accounts').all(), [{ zalo_group_id: 'g1', account_id: 'acc1' }])
})

test('pruneUnknownAccounts with no configured account removes nothing', async () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO chat_groups (zalo_group_id, name) VALUES ('g1', 'A')").run()
  db.prepare("INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES ('g1', 'acc1', 1)").run()
  assert.equal(pruneUnknownAccounts(db, []), 0)
})
