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
      // Nick đang có nhóm mà bỗng trả về 0 nhóm (hoặc thiếu gridVerMap) — gần như chắc là Zalo trả lỗi
      // ngầm, không phải nick rời hết nhóm cùng lúc. Coi là quét lỗi: giữ nguyên nhóm cũ của nick này.
      if (ids.length === 0) {
        const had = (db.prepare('SELECT COUNT(*) AS n FROM group_accounts WHERE account_id = ?').get(id) as { n: number }).n
        if (had > 0) {
          failed.push(id)
          this.deps.logger.error(`Quét nhóm của ${id} trả về 0 nhóm (trước đó ${had}) — coi như lỗi, giữ nguyên`)
          continue
        }
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

/**
 * Xoá dấu "nick đang ở nhóm" của các nick không còn cấu hình (đã gỡ file tài khoản) — nếu không, nhóm
 * chỉ có nick cũ ở sẽ không bao giờ thành "rời". Gọi lúc khởi động với danh sách nick đã nạp.
 * Danh sách rỗng → không xoá gì (phòng trường hợp nạp tài khoản lỗi).
 */
export function pruneUnknownAccounts(db: Db, accountIds: string[]): number {
  if (accountIds.length === 0) return 0
  const placeholders = accountIds.map(() => '?').join(', ')
  return db.prepare(`DELETE FROM group_accounts WHERE account_id NOT IN (${placeholders})`).run(...accountIds).changes
}

/** Số nhóm mỗi nick đang ở (group_accounts) — gửi kèm heartbeat cho tab "Nick Zalo". */
export function accountGroupCounts(db: Db): Map<string, number> {
  const rows = db.prepare('SELECT account_id, COUNT(*) AS n FROM group_accounts GROUP BY account_id').all() as { account_id: string; n: number }[]
  return new Map(rows.map((r) => [r.account_id, r.n]))
}

/** Gỡ nick từ trang admin: xoá dấu "đang ở nhóm" của nick đó (lượt quét sau đánh "rời" nhóm chỉ nick đó ở). */
export function forgetAccount(db: Db, accountId: string): number {
  return db.prepare('DELETE FROM group_accounts WHERE account_id = ?').run(accountId).changes
}

/**
 * Gỡ nick CUỐI: không còn nick đăng nhập nên lượt quét sau bỏ qua → tự đánh "rời" các nhóm không còn
 * nick nào ở (không còn dòng group_accounts). Nhóm đã "rời" giữ nguyên left_at cũ.
 */
export function markOrphanGroupsLeft(db: Db, now: number): number {
  return db.prepare(`UPDATE chat_groups SET left_at = ? WHERE left_at IS NULL
    AND zalo_group_id NOT IN (SELECT zalo_group_id FROM group_accounts)`).run(now).changes
}
