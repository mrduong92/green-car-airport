# Cuốc Free — Giai đoạn 4: Quản trị — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Service tự quét toàn bộ nhóm của các nick phụ và đồng bộ sang Laravel; admin có trang "Cuốc Free" để bật/tắt nhóm, chặn/bỏ chặn người bắn và xem tình trạng service.

**Architecture:** `GroupScanner` (service) mỗi 30 phút gọi `getAllGroups()` cho từng nick đang đăng nhập, tra tên/số thành viên các nhóm mới bằng `getGroupInfo` theo lô ≤ 20, lưu vào SQLite (schema v4: `chat_groups.member_count`, `chat_groups.left_at`, bảng `group_accounts`). `GroupsSync` (đã có) gửi thêm `member_count`, `accounts`, `left`. Laravel lưu 3 cột mới ở `zalo_groups`, mở API admin (nhóm, người bắn, tình trạng) và trang admin `/free-rides` 3 tab. Bật/tắt và chặn đã có hiệu lực sẵn qua `visibleTo` (tab Free) và `/config` (service).

**Tech Stack:** Node 22 + TypeScript + better-sqlite3 + zca-js 2.2.0; Laravel 13; React 19 + TanStack Query v5 + Tailwind (app admin, port 5175).

**Spec:** `docs/superpowers/specs/2026-10-09-zalo-free-rides-admin-design.md`. Nhánh: `feat/zalo-free-rides-phase3` (PR #13 — một PR duy nhất).

## Global Constraints

- Service **chỉ đọc** với Zalo: chỉ thêm `getAllGroups` (đã dùng trong `scripts/list-groups.ts`) và `getGroupInfo` theo lô; không vào nhóm, không gửi tin.
- `getGroupInfo` theo lô ≤ 20 ID, nghỉ 1 giây giữa các lô; quét mỗi 30 phút (`GROUP_SCAN_MS`, mặc định 1_800_000) và một lần ngay sau khi có nick đăng nhập.
- Nick quét lỗi → không đánh dấu nhóm của nó là đã rời. Nhóm chỉ "rời" khi **không nick nào** trong số các nick quét thành công ở lượt đó còn thấy nó.
- SQLite: thêm `SCHEMA_V4`, không sửa V1–V3.
- `POST /api/internal/zalo/groups` tương thích ngược (3 trường mới tuỳ chọn); không đụng `enabled`.
- API admin sau `auth:sanctum` → `role:admin`, trả mảng thuần; UI tiếng Việt, design token Tailwind, responsive mobile.
- Giờ hiển thị theo `Asia/Ho_Chi_Minh`. Không gọi Zalo thật trong test. Không chạy `migrate:fresh`/`db:wipe`/`make fresh` (DB local có dữ liệu người dùng).

## Review Focus

1. **Một nick mất kết nối giữa lượt quét** → nhóm của nó không bị đánh dấu "rời". Test: `a failed account scan does not mark its groups as left` (Task 1).
2. **Nhóm đã có tên/thành viên** → không gọi `getGroupInfo` lại mỗi lượt (chỉ nhóm mới hoặc chưa có tên). Test: `known groups are not looked up again` (Task 1).
3. **Admin tắt nhóm / chặn người bắn** → cuốc biến khỏi `GET /api/driver/free-rides` ngay. Test: `test_disabling_group_and_blocking_sender_hide_rides_for_drivers` (Task 3).
4. **Service cũ gửi payload groups không có trường mới** → vẫn 200, không xoá dữ liệu cột mới. Test: `test_groups_endpoint_accepts_old_payload` (Task 2).
5. **Người không phải admin gọi API admin** → 403. Test: `test_non_admin_is_forbidden` (Task 3).

---

### Task 1: Service — quét toàn bộ nhóm của nick phụ

**Files:**
- Modify: `zalo-service/src/db.ts` (thêm `SCHEMA_V4`)
- Create: `zalo-service/src/group-scanner.ts`
- Modify: `zalo-service/src/accounts.ts` (`ApiLike.getAllGroups`, `getGroupInfo` nhận mảng; `AccountManager.loggedIn()`)
- Modify: `zalo-service/src/sync.ts` (`GroupsSync` gửi trường mới, gửi cả nhóm chưa có tin)
- Modify: `zalo-service/src/config.ts` (`groupScanMs`)
- Modify: `zalo-service/src/index.ts` (nối scanner)
- Test: `zalo-service/test/group-scanner.test.ts`, `zalo-service/test/db.test.ts` (thêm ca v4), `zalo-service/test/sync.test.ts` (thêm ca groups)

**Interfaces:**
- Produces:
  - `ApiLike.getAllGroups(): Promise<{ gridVerMap: Record<string, string> }>`; `ApiLike.getGroupInfo(groupId: string | string[]): Promise<{ gridInfoMap?: Record<string, { name?: string; totalMember?: number }> }>`.
  - `AccountManager.loggedIn(): { id: string; api: ApiLike }[]`.
  - `class GroupScanner({ db, accounts: () => { id: string; api: ApiLike }[], logger, now?, sleep?, batchSize? = 20, batchPauseMs? = 1000 })`: `scan(): Promise<{ scanned: string[]; failed: string[]; groups: number; looked_up: number }>`.
  - `GroupsSync` payload mỗi nhóm: `{ zalo_group_id, name, last_message_at, messages_24h, member_count: number | null, accounts: string[], left: boolean }`.
  - `Config.groupScanMs` (env `GROUP_SCAN_MS`, mặc định 1_800_000).

- [ ] **Step 1: Write the failing tests**

`zalo-service/test/group-scanner.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { GroupScanner } from '../src/group-scanner.js'
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
  const groups: Record<string, { name: string; totalMember: number }> = { g1: { name: 'Taxi', totalMember: 10 } }
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
```

Thêm vào `zalo-service/test/db.test.ts`:

```ts
test('schema v4 adds member_count, left_at and group_accounts; a v3 database upgrades in place', () => {
  const db = openDb(':memory:')
  assert.equal(db.pragma('user_version', { simple: true }), 4)
  const cols = (db.prepare('PRAGMA table_info(chat_groups)').all() as { name: string }[]).map((c) => c.name)
  assert.ok(cols.includes('member_count') && cols.includes('left_at'))
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'group_accounts'").get())
})
```

(Nếu file đã có test kỳ vọng `user_version` = 3 cho DB mới / DB nâng cấp → đổi thành 4; test DB v3 có dữ liệu `chat_groups` nâng lên v4 giữ nguyên `name`.)

Thêm vào `zalo-service/test/sync.test.ts`:

```ts
test('GroupsSync sends every known group with member count, accounts and left flag', async () => {
  const db = openDb(':memory:')
  db.prepare("INSERT INTO chat_groups (zalo_group_id, name, member_count, left_at) VALUES ('g1', 'Taxi', 900, NULL), ('g2', 'Cũ', 10, 5)").run()
  db.prepare("INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES ('g1', 'acc1', 1), ('g1', 'acc2', 1)").run()
  const sent: unknown[] = []
  const sync = new GroupsSync({ db, send: async (_p, body) => { sent.push(body); return { status: 200 } }, logger: silentLogger, now: () => 10 })
  await sync.flush()
  const groups = (sent[0] as { groups: Record<string, unknown>[] }).groups
  assert.deepEqual(groups.find((g) => g.zalo_group_id === 'g1'), { zalo_group_id: 'g1', name: 'Taxi', last_message_at: null, messages_24h: 0, member_count: 900, accounts: ['acc1', 'acc2'], left: false })
  assert.equal(groups.find((g) => g.zalo_group_id === 'g2')?.left, true)
})
```

(Đọc `test/sync.test.ts` hiện có để dùng đúng import/kiểu `send` của file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd zalo-service && export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH && npm test`
Expected: FAIL — `Cannot find module '../src/group-scanner.js'`, `user_version` 3 ≠ 4, GroupsSync thiếu `member_count`.

- [ ] **Step 3: Implement**

`zalo-service/src/db.ts` — thêm sau `SCHEMA_V3` và đưa vào `MIGRATIONS`:

```ts
// v4: quét toàn bộ nhóm của nick phụ (giai đoạn 4) — số thành viên, đã rời, nick nào đang ở nhóm nào.
const SCHEMA_V4 = `
ALTER TABLE chat_groups ADD COLUMN member_count INTEGER;
ALTER TABLE chat_groups ADD COLUMN left_at INTEGER;
CREATE TABLE group_accounts (
  zalo_group_id TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  seen_at       INTEGER NOT NULL,
  PRIMARY KEY (zalo_group_id, account_id)
);
`
const MIGRATIONS = [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4]
```

`zalo-service/src/accounts.ts` — trong `ApiLike`: thêm `getAllGroups(): Promise<{ gridVerMap: Record<string, string> }>` và đổi `getGroupInfo(groupId: string | string[]): Promise<{ gridInfoMap?: Record<string, { name?: string; totalMember?: number }> }>`; trong `AccountManager` thêm:

```ts
  // Các nick đang đăng nhập (để quét nhóm từng nick).
  loggedIn(): { id: string; api: ApiLike }[] {
    return [...this.apis].filter(([id]) => this.states.get(id)?.loggedIn).map(([id, api]) => ({ id, api }))
  }
```

Cập nhật các fake api trong test (`test/accounts*.test.ts`, …) thêm `getAllGroups: async () => ({ gridVerMap: {} })` nếu typecheck yêu cầu.

`zalo-service/src/group-scanner.ts`:

```ts
import type { Db } from './db.js'
import type { ApiLike } from './accounts.js'
import type { Logger } from './logger.js'

/**
 * Quét toàn bộ nhóm mà các nick phụ đang ở (giai đoạn 4) — admin không phải nhập nhóm bằng tay.
 * CHỈ ĐỌC: getAllGroups + getGroupInfo theo lô ≤ 20, nghỉ giữa các lô. Chỉ tra tên nhóm mới/chưa có tên.
 * Nhóm "rời" khi không nick nào QUÉT THÀNH CÔNG ở lượt này còn thấy nó — nick lỗi không làm nhóm của nó "rời".
 */
export class GroupScanner {
  constructor(
    private readonly deps: {
      db: Db
      accounts: () => { id: string; api: ApiLike }[]
      logger: Logger
      now?: () => number
      sleep?: (ms: number) => Promise<void>
      batchSize?: number
      batchPauseMs?: number
    },
  ) {}

  async scan(): Promise<{ scanned: string[]; failed: string[]; groups: number; looked_up: number }> {
    const now = (this.deps.now ?? Date.now)()
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
    const batchSize = this.deps.batchSize ?? 20
    const db = this.deps.db
    const scanned: string[] = []
    const failed: string[] = []
    const seen = new Set<string>()
    let lookedUp = 0

    for (const { id, api } of this.deps.accounts()) {
      let ids: string[]
      try {
        ids = Object.keys((await api.getAllGroups()).gridVerMap ?? {})
      } catch (err) {
        failed.push(id)
        this.deps.logger.error(`Quét nhóm của ${id} lỗi:`, err instanceof Error ? err.message : err)
        continue
      }
      scanned.push(id)

      const known = new Set(
        (db.prepare(`SELECT zalo_group_id FROM chat_groups WHERE name <> '' AND member_count IS NOT NULL`).all() as { zalo_group_id: string }[])
          .map((r) => r.zalo_group_id),
      )
      const unknown = ids.filter((g) => !known.has(g))
      for (let i = 0; i < unknown.length; i += batchSize) {
        if (i > 0) await sleep(this.deps.batchPauseMs ?? 1000)
        const batch = unknown.slice(i, i + batchSize)
        try {
          const info = (await api.getGroupInfo(batch)).gridInfoMap ?? {}
          lookedUp += batch.length
          const upsert = db.prepare(`
            INSERT INTO chat_groups (zalo_group_id, name, member_count) VALUES (?, ?, ?)
            ON CONFLICT (zalo_group_id) DO UPDATE SET
              name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE chat_groups.name END,
              member_count = COALESCE(excluded.member_count, chat_groups.member_count)`)
          db.transaction(() => {
            for (const g of batch) upsert.run(g, (info[g]?.name ?? '').slice(0, 255), info[g]?.totalMember ?? null)
          })()
        } catch (err) {
          this.deps.logger.error(`Tra thông tin ${batch.length} nhóm lỗi:`, err instanceof Error ? err.message : err)
        }
      }

      const ensure = db.prepare(`INSERT INTO chat_groups (zalo_group_id) VALUES (?) ON CONFLICT DO NOTHING`)
      const mark = db.prepare(`INSERT INTO group_accounts (zalo_group_id, account_id, seen_at) VALUES (?, ?, ?)
        ON CONFLICT (zalo_group_id, account_id) DO UPDATE SET seen_at = excluded.seen_at`)
      db.transaction(() => {
        db.prepare('DELETE FROM group_accounts WHERE account_id = ?').run(id)
        for (const g of ids) { ensure.run(g); mark.run(g, id, now); seen.add(g) }
      })()
    }

    if (scanned.length > 0) {
      // Nhóm của nick quét lỗi vẫn giữ trong group_accounts → không bị coi là rời.
      db.prepare(`UPDATE chat_groups SET left_at = NULL WHERE zalo_group_id IN (SELECT zalo_group_id FROM group_accounts)`).run()
      db.prepare(`UPDATE chat_groups SET left_at = ? WHERE left_at IS NULL
        AND zalo_group_id NOT IN (SELECT zalo_group_id FROM group_accounts)`).run(now)
    }
    this.deps.logger.info(`Quét nhóm: ${scanned.length} nick, ${seen.size} nhóm, tra mới ${lookedUp}${failed.length ? `, lỗi: ${failed.join(', ')}` : ''}`)
    return { scanned, failed, groups: seen.size, looked_up: lookedUp }
  }
}
```

(Chú ý ca "rời": nhóm của nick quét lỗi ở lượt này vẫn còn dòng `group_accounts` từ lượt trước → không bị đánh `left_at`. Nhóm mà nick quét thành công không còn thấy → dòng của nick đó bị xoá; nếu không nick nào khác còn dòng → `left_at`.)

`zalo-service/src/sync.ts` — `GroupsSync.flush()` đổi truy vấn để gửi mọi nhóm đã biết kèm trường mới:

```ts
    const rows = this.deps.db.prepare(`
      SELECT g.zalo_group_id, g.name, g.last_message_at, COALESCE(c.n, 0) AS messages_24h, g.member_count, g.left_at,
             (SELECT group_concat(account_id) FROM group_accounts a WHERE a.zalo_group_id = g.zalo_group_id) AS accounts
      FROM chat_groups g
      LEFT JOIN (SELECT zalo_group_id, COUNT(*) AS n FROM messages WHERE sent_at >= ? GROUP BY zalo_group_id) c
        ON c.zalo_group_id = g.zalo_group_id
      ORDER BY g.zalo_group_id`).all(since) as { zalo_group_id: string; name: string; last_message_at: number | null; messages_24h: number; member_count: number | null; left_at: number | null; accounts: string | null }[]
    const groups = rows.map(({ left_at, accounts, ...g }) => ({
      ...g,
      accounts: accounts ? accounts.split(',').sort() : [],
      left: left_at !== null,
    }))
```

`zalo-service/src/config.ts` — `groupScanMs: Number(env.GROUP_SCAN_MS || 1_800_000)` (+ kiểu trong `Config`, test mặc định trong `test/config*.test.ts`).

`zalo-service/src/index.ts` — sau khi tạo `manager`:

```ts
const groupScanner = new GroupScanner({ db, accounts: () => manager?.loggedIn() ?? [], logger })
// Quét lần đầu khi đã có nick đăng nhập (đăng nhập chạy nền, không chặn heartbeat), rồi mỗi groupScanMs.
const firstScan = setInterval(() => {
  if ((manager?.loggedIn().length ?? 0) === 0) return
  clearInterval(firstScan)
  groupScanner.scan().then(() => groupsSync.flush()).catch((err) => logger.error('Quét nhóm lỗi:', err))
}, 5_000)
every(cfg.groupScanMs, () => groupScanner.scan().then(() => groupsSync.flush()))
```

(Đặt sau khai báo `groupsSync`; `every` là helper đã có trong file.) Thêm `GROUP_SCAN_MS` vào `.env.example` và bảng biến trong `README.md` của service.

- [ ] **Step 4: Run tests, typecheck, build**

Run: `cd zalo-service && npm test && npx tsc --noEmit -p . && npm run build`
Expected: PASS (`# fail 0`), typecheck sạch, build OK.

- [ ] **Step 5: Commit**

```bash
git add zalo-service/src/db.ts zalo-service/src/group-scanner.ts zalo-service/src/accounts.ts zalo-service/src/sync.ts zalo-service/src/config.ts zalo-service/src/index.ts zalo-service/test zalo-service/.env.example zalo-service/README.md
git commit -m "feat(zalo-service): quét toàn bộ nhóm của nick phụ mỗi 30 phút, đồng bộ số thành viên, nick đang ở, đã rời"
```

---

### Task 2: Laravel — lưu thông tin nhóm mới từ service

**Files:**
- Create: `backend/database/migrations/2026_10_10_000001_add_scan_fields_to_zalo_groups.php`
- Modify: `backend/app/Models/ZaloGroup.php`, `backend/app/Http/Controllers/Webhooks/ZaloServiceController.php` (`groups()`)
- Test: `backend/tests/Feature/ZaloServiceConfigTest.php` (hoặc file test groups hiện có — đọc để biết nơi đặt)

**Interfaces:**
- Consumes: payload Task 1 (`member_count`, `accounts`, `left`).
- Produces: `zalo_groups.member_count` (unsigned int null), `accounts` (json null), `left_at` (timestamp null). Model cast `accounts` → array, `left_at` → datetime.

- [ ] **Step 1: Write the failing tests**

```php
    public function test_groups_endpoint_stores_scan_fields_and_keeps_enabled(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Cũ', 'enabled' => false]);
        $this->signedPost('/api/internal/zalo/groups', ['groups' => [
            ['zalo_group_id' => 'g1', 'name' => 'Taxi', 'last_message_at' => null, 'messages_24h' => 3, 'member_count' => 900, 'accounts' => ['acc1', 'acc2'], 'left' => false],
            ['zalo_group_id' => 'g2', 'name' => 'Rời', 'last_message_at' => null, 'messages_24h' => 0, 'member_count' => 10, 'accounts' => [], 'left' => true],
        ]])->assertOk();

        $g1 = ZaloGroup::where('zalo_group_id', 'g1')->first();
        $this->assertFalse($g1->enabled);
        $this->assertSame(900, $g1->member_count);
        $this->assertSame(['acc1', 'acc2'], $g1->accounts);
        $this->assertNull($g1->left_at);
        $this->assertNotNull(ZaloGroup::where('zalo_group_id', 'g2')->first()->left_at);
    }

    public function test_groups_endpoint_accepts_old_payload(): void
    {
        ZaloGroup::create(['zalo_group_id' => 'g1', 'name' => 'Taxi', 'member_count' => 900, 'accounts' => ['acc1']]);
        $this->signedPost('/api/internal/zalo/groups', ['groups' => [
            ['zalo_group_id' => 'g1', 'name' => 'Taxi', 'last_message_at' => null, 'messages_24h' => 1],
        ]])->assertOk();
        $g1 = ZaloGroup::where('zalo_group_id', 'g1')->first();
        $this->assertSame(900, $g1->member_count);
        $this->assertSame(['acc1'], $g1->accounts);
    }
```

(Dùng đúng helper ký HMAC có sẵn trong file test, ví dụ `signedPost`/trait `SignsZaloBotRequests`.)

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec app php artisan test --filter=ZaloServiceConfigTest`
Expected: FAIL — cột `member_count` không tồn tại.

- [ ] **Step 3: Implement**

Migration:

```php
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('zalo_groups', function (Blueprint $table) {
            $table->unsignedInteger('member_count')->nullable()->after('messages_24h');
            $table->json('accounts')->nullable()->after('member_count');
            $table->timestamp('left_at')->nullable()->after('accounts');
        });
    }

    public function down(): void
    {
        Schema::table('zalo_groups', function (Blueprint $table) {
            $table->dropColumn(['member_count', 'accounts', 'left_at']);
        });
    }
};
```

`ZaloGroup` casts thêm `'member_count' => 'integer', 'accounts' => 'array', 'left_at' => 'datetime'`.

`groups()`: validate thêm `'groups.*.member_count' => ['sometimes', 'nullable', 'integer', 'min:0']`, `'groups.*.accounts' => ['sometimes', 'array', 'max:50']`, `'groups.*.accounts.*' => ['string', 'max:64']`, `'groups.*.left' => ['sometimes', 'boolean']`. Payload cũ không có các trường này → **không ghi đè** cột mới: tách 2 nhóm hàng — hàng có trường mới upsert cả `member_count`, `accounts`, `left_at` (`left_at` = `now()` nếu `left` và hàng cũ chưa có `left_at`; giữ nguyên `left_at` cũ nếu đã có; `null` nếu `!left`), hàng không có trường mới upsert như cũ. Đơn giản nhất: lặp từng hàng với `ZaloGroup::updateOrCreate` trong một transaction (≤ 2000 hàng, 10 phút/lần — chấp nhận được), không bao giờ đưa `enabled` vào dữ liệu ghi.

- [ ] **Step 4: Run tests**

Run: `docker compose exec app php artisan migrate --force && docker compose exec app php artisan test --filter='Zalo|FreeRide'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_10_10_000001_add_scan_fields_to_zalo_groups.php backend/app/Models/ZaloGroup.php backend/app/Http/Controllers/Webhooks/ZaloServiceController.php backend/tests/Feature
git commit -m "feat(zalo): lưu số thành viên, nick đang ở và trạng thái đã rời của nhóm do service quét"
```

---

### Task 3: Laravel — API admin Cuốc Free

**Files:**
- Create: `backend/app/Http/Controllers/Admin/FreeRideAdminController.php`
- Modify: `backend/routes/api.php` (trong nhóm `role:admin`), `backend/app/Services/Zalo/ZaloServiceMonitor.php` (thêm `snapshot(): array` cho trang tình trạng)
- Test: `backend/tests/Feature/FreeRideAdminTest.php`

**Interfaces:**
- Consumes: `ZaloGroup` (Task 2), `FreeRide`, `ZaloSenderBlock`, `FreeRideReport`, `ZaloServiceMonitor` cache `zalo:services` / `zalo:heartbeat:{id}`.
- Produces (prefix `/api/admin/free-rides`):
  - `GET /groups?q=&status=enabled|disabled|left&page=` → `{ data: GroupItem[], meta: { current_page, last_page, total } }`, `GroupItem = { zalo_group_id, name, enabled, member_count, messages_24h, last_message_at (ms|null), accounts: string[], left: bool }`, sắp `messages_24h` giảm dần rồi `name`; 50/trang. Mặc định (không `status`) trả nhóm chưa rời.
  - `PATCH /groups/{zaloGroupId}` `{ enabled: bool }` → `GroupItem`.
  - `GET /senders?q=&blocked=1&page=` → `{ data: SenderItem[], meta }`, `SenderItem = { sender_uid, sender_name, active_rides, rides_7d, reports, blocked }` (gộp `free_rides` theo `sender_uid`, `sender_name` của cuốc mới nhất; `active_rides` = `expires_at > now`; `rides_7d` = `posted_at >= now-7d`; `reports` = đếm `free_ride_reports` của các cuốc người này; `blocked` = có trong `zalo_sender_blocks`). `blocked=1` → chỉ người đang bị chặn (kể cả không còn cuốc). Sắp `active_rides` giảm dần, rồi `rides_7d`. 50/trang.
  - `POST /senders/{senderUid}/block` (`{ reason?: string|max:255 }`) → `{ blocked: true }`, ghi `blocked_by` = admin; `DELETE /senders/{senderUid}/block` → `{ blocked: false }`.
  - `GET /status` → `{ services: [{ service_id, last_heartbeat_at (ms), stale: bool, accounts: [{ id, connected, logged_in, last_error }], ai_spent_today_usd, ai_budget_usd, outbox_backlog, held_back_rides, qr_ok_24h, qr_empty_24h }], active_rides, groups_enabled, groups_total }`.

- [ ] **Step 1: Write the failing tests** (`backend/tests/Feature/FreeRideAdminTest.php`)

Viết đủ các test sau (tạo admin/driver/customer bằng factory hoặc cách các test admin hiện có làm — đọc `tests/Feature` để theo mẫu; tạo `FreeRide` với `qr_code` chữ/số, `expires_at` tương lai):
- `test_non_admin_is_forbidden` — driver và customer gọi `GET /api/admin/free-rides/groups` → 403.
- `test_groups_list_filters_and_sorts` — 3 nhóm (bật nhiều tin, tắt, đã rời): mặc định trả 2 nhóm chưa rời theo `messages_24h` giảm dần; `status=disabled` → 1; `status=left` → 1; `q` khớp tên.
- `test_toggle_group` — `PATCH` `{ enabled: false }` → DB `enabled=false`, response `enabled=false`; nhóm không tồn tại → 404.
- `test_senders_list_aggregates_rides_reports_and_block_state` — người bắn A có 2 cuốc còn hạn + 1 cuốc 3 ngày trước đã hết hạn + 1 báo cáo; người B bị chặn: kiểm `active_rides=2`, `rides_7d=3`, `reports=1`, `blocked` đúng; `blocked=1` chỉ trả B.
- `test_block_and_unblock_sender` — `POST block` tạo `zalo_sender_blocks` với `blocked_by`; gọi lại không lỗi (idempotent); `DELETE` xoá.
- `test_disabling_group_and_blocking_sender_hide_rides_for_drivers` — tài xế active thấy 2 cuốc (nhóm g1 người A; nhóm g2 người B); admin tắt g1 và chặn B → `GET /api/driver/free-rides` của tài xế trả 0 cuốc.
- `test_status_reports_heartbeat_and_counts` — ghi heartbeat qua `ZaloServiceMonitor::recordHeartbeat([...])` (đủ trường bắt buộc như test heartbeat hiện có + `ai_spent_today_usd`, `ai_budget_usd`); kiểm `services[0].accounts`, `stale=false`, `active_rides`, `groups_enabled`/`groups_total`; không có heartbeat → `services=[]`.

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec app php artisan test --filter=FreeRideAdminTest`
Expected: FAIL — 404 (route chưa có).

- [ ] **Step 3: Implement**

Route (trong `Route::middleware('role:admin')->group(...)`):

```php
        Route::prefix('admin/free-rides')->controller(FreeRideAdminController::class)->group(function () {
            Route::get('/groups', 'groups');
            Route::patch('/groups/{zaloGroupId}', 'toggleGroup');
            Route::get('/senders', 'senders');
            Route::post('/senders/{senderUid}/block', 'block');
            Route::delete('/senders/{senderUid}/block', 'unblock');
            Route::get('/status', 'status');
        });
```

Controller: validate query (`q` string max 100, escape `%`/`_` trong LIKE như `FreeRideController`; `status` in enabled,disabled,left; `page` integer). `senders` dùng một truy vấn gộp:

```php
$rides = FreeRide::query()
    ->selectRaw('sender_uid, COUNT(CASE WHEN expires_at > ? THEN 1 END) AS active_rides, COUNT(CASE WHEN posted_at >= ? THEN 1 END) AS rides_7d, MAX(posted_at) AS last_posted_at', [now(), now()->subDays(7)])
    ->groupBy('sender_uid');
```

rồi `leftJoinSub` báo cáo (`free_ride_reports` join `free_rides` theo `ride_uid` → đếm theo `sender_uid`) và cờ chặn; tên lấy từ cuốc mới nhất (subquery theo `sender_uid` + `posted_at = last_posted_at`, hoặc `MAX(sender_name)` nếu đơn giản hơn — ghi rõ lựa chọn). Với `blocked=1`: lấy từ `zalo_sender_blocks` left join tổng hợp cuốc (người bị chặn không còn cuốc vẫn hiện, `sender_name` rỗng → hiển thị UID). Phân trang `paginate(50)` → trả `data` + `meta`.

`ZaloServiceMonitor::snapshot()`: đọc `zalo:services` + từng `zalo:heartbeat:{id}`, trả mảng service như Interfaces (`stale` theo `config('zalo.heartbeat_stale_seconds')`, thời điểm ms từ `received_at`), bỏ service không còn heartbeat trong cache.

- [ ] **Step 4: Run tests**

Run: `docker compose exec app php artisan test --filter='FreeRideAdmin|FreeRide|Zalo' && docker compose exec app ./vendor/bin/pint app/Http/Controllers/Admin/FreeRideAdminController.php app/Services/Zalo/ZaloServiceMonitor.php routes/api.php tests/Feature/FreeRideAdminTest.php`
Expected: PASS, pint sạch.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Admin/FreeRideAdminController.php backend/app/Services/Zalo/ZaloServiceMonitor.php backend/routes/api.php backend/tests/Feature/FreeRideAdminTest.php
git commit -m "feat(zalo): API admin Cuốc Free — danh sách/bật tắt nhóm, người bắn chặn/bỏ chặn, tình trạng service"
```

---

### Task 4: Admin UI — trang "Cuốc Free"

**Files:**
- Create: `frontend/src/api/adminFreeRides.ts`, `frontend/src/pages/admin/FreeRidesAdminPage.tsx`, `frontend/src/components/admin/freeRides/GroupsTab.tsx`, `SendersTab.tsx`, `StatusTab.tsx`
- Modify: `frontend/src/types.d.ts` (kiểu `App.AdminZaloGroup`, `App.AdminFreeRideSender`, `App.AdminFreeRideStatus`, `App.Paginated<T>` nếu chưa có), `frontend/src/router/admin.tsx` (route `/free-rides`), `frontend/src/layouts/AdminLayout.tsx` (mục menu)

**Interfaces:**
- Consumes: API Task 3 (đúng tên trường).
- Produces: route admin `/free-rides`; mục menu `{ to: '/free-rides', icon: 'local_taxi', label: 'Cuốc Free' }` (không `primary` — nằm trong sheet "Thêm" trên mobile); `data-testid`: `admin-free-tab-groups`, `admin-free-tab-senders`, `admin-free-tab-status`, `admin-group-row`, `admin-group-toggle`, `admin-sender-row`, `admin-sender-block`, `admin-sender-unblock`.

- [ ] **Step 1: API + types** — `adminFreeRides.ts` dùng instance axios chung (`@/api/axios`) như `api/admin.ts`: `getZaloGroups(params)`, `setZaloGroupEnabled(id, enabled)`, `getFreeRideSenders(params)`, `blockFreeRideSender(uid, reason?)`, `unblockFreeRideSender(uid)`, `getFreeRideStatus()`.

- [ ] **Step 2: Trang + 3 tab** (đọc `pages/admin/DriversPage.tsx`, `CustomersPage.tsx` để theo mẫu bảng/thẻ, ô tìm kiếm, phân trang, toast, `ConfirmDialog`):
  - Trang: tiêu đề "Cuốc Free", 3 tab (pill), tab chọn lưu trong URL `?tab=groups|senders|status`.
  - **GroupsTab:** ô tìm (debounce 300ms), lọc "Đang theo dõi / Đã tắt / Nick đã rời"; mỗi dòng/thẻ: tên (rỗng → ID), số thành viên, tin 24 giờ, tin gần nhất (giờ VN, `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ... })`), số nick đang ở, công tắc bật/tắt (cập nhật lạc quan, lỗi → hoàn tác + toast). Ghi chú cố định: "Muốn thêm nhóm: thêm nick phụ vào nhóm Zalo — hệ thống tự thấy trong ≤ 30 phút." Phân trang "Tải thêm"/trang.
  - **SendersTab:** ô tìm, công tắc "Chỉ người đang bị chặn"; mỗi dòng: tên (rỗng → UID), cuốc đang hiện, cuốc 7 ngày, số báo cáo; nút "Chặn" (mở `ConfirmDialog`: "Chặn người bắn này? Mọi cuốc của họ sẽ biến khỏi tab Free của tất cả tài xế.") / "Bỏ chặn"; xong → invalidate danh sách.
  - **StatusTab:** `refetchInterval: 60_000`; mỗi service: heartbeat cuối "x phút trước" (đỏ nếu `stale`), thẻ từng nick (xanh "Đang kết nối" / đỏ "Mất kết nối" + `last_error`), chi phí AI hôm nay `$x.xx / $y` (thanh tiến độ), hộp thư đi tồn, cuốc bị giữ vì thiếu mã; tổng: cuốc đang hiện, nhóm đang bật / tổng. Không có service → "Chưa có service Zalo nào gửi tín hiệu".
  - Trạng thái tải / lỗi (thông báo + "Thử lại") / rỗng cho mỗi tab.

- [ ] **Step 3: Route + menu** — thêm route `/free-rides` vào router admin (cùng nhánh layout với các trang admin khác) và mục menu như Interfaces.

- [ ] **Step 4: Verify**

Run: `docker compose exec frontend npx tsc -b --noEmit && docker compose exec frontend npx eslint src/api/adminFreeRides.ts src/pages/admin/FreeRidesAdminPage.tsx src/components/admin/freeRides && docker compose exec frontend npm run build:admin` (đọc `frontend/package.json` để dùng đúng tên script build admin).
Expected: sạch, build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/adminFreeRides.ts frontend/src/pages/admin/FreeRidesAdminPage.tsx frontend/src/components/admin/freeRides frontend/src/types.d.ts frontend/src/router/admin.tsx frontend/src/layouts/AdminLayout.tsx
git commit -m "feat(admin): trang Cuốc Free — nhóm Zalo bật/tắt, người bắn chặn/bỏ chặn, tình trạng service"
```

---

### Task 5: E2E trang admin + tài liệu

**Files:**
- Create: `frontend/e2e/free-rides-admin.spec.ts`
- Modify: `docs/DEPLOY.md` (mục Cuốc Free: giai đoạn 4), `zalo-service/README.md` (quét nhóm, bỏ hướng dẫn `ALLOWED_GROUP_IDS` cho production)

- [ ] **Step 1: E2E** (theo `frontend/e2e/README.md`, fixture `e2e/fixtures/freeRides.ts` — `pushFreeRides` với tag riêng mỗi lần chạy; đăng ký nhóm qua `POST /api/internal/zalo/groups` có ký như fixture): đăng nhập admin seed (`0923456789`, app admin port 5175 — xem e2e README cho cách đăng nhập admin), vào `/free-rides`:
  1. Tab Nhóm: tìm theo tên nhóm e2e → thấy `admin-group-row`; tắt `admin-group-toggle` → đăng nhập tài xế (context riêng), tab Free không còn cuốc của nhóm đó.
  2. Tab Người bắn: tìm người bắn e2e → `admin-sender-block` → xác nhận → tab Free của tài xế không còn cuốc người đó; `admin-sender-unblock` → hiện lại.
  3. Tab Tình trạng: hiển thị (có service hoặc thông báo chưa có service).
  Dọn: bật lại nhóm, bỏ chặn (test chạy lại được).

Run: `cd frontend && npx playwright test e2e/free-rides-admin.spec.ts` (chạy 2 lần liên tiếp)
Expected: PASS cả 2 lần.

- [ ] **Step 2: Docs** — DEPLOY.md thêm "Giai đoạn 4": `php artisan migrate --force` (migration `2026_10_10_*`), build/rsync app admin, service: để `ALLOWED_GROUP_IDS` rỗng để nghe mọi nhóm, quét nhóm 30 phút (`GROUP_SCAN_MS`), cách thêm nhóm (thêm nick vào nhóm Zalo), bật/tắt ở admin. README service: mục "Quét nhóm".

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/free-rides-admin.spec.ts docs/DEPLOY.md zalo-service/README.md
git commit -m "test(admin): e2e trang Cuốc Free; tài liệu triển khai giai đoạn 4"
```
