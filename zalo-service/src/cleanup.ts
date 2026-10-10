import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './db.js'

// Dọn dữ liệu cũ (chạy trong vòng prune mỗi giờ ở index.ts). Mọi mốc thời gian là ms epoch.

const REMOVED_SESSION = /^.+\.json\.removed-(\d+)$/

/**
 * Gỡ nick (AccountRequestsPoller) đổi tên data/accounts/<id>.json → <id>.json.removed-<ms> thay vì xoá
 * ngay (phòng gỡ nhầm). File này vẫn chứa cookie đăng nhập còn sống → xoá hẳn khi quá retentionMs,
 * tính theo mốc <ms> trong tên file (đổi tên giữ nguyên mtime nên không dùng mtime được).
 */
export function pruneRemovedSessions(dir: string, now: number, retentionMs: number): number {
  if (!existsSync(dir)) return 0
  let deleted = 0
  for (const file of readdirSync(dir)) {
    const m = REMOVED_SESSION.exec(file)
    if (!m || Number(m[1]) >= now - retentionMs) continue
    unlinkSync(join(dir, file))
    deleted++
  }
  return deleted
}

/** Nhóm nick phụ đã rời quá retentionMs: xoá khỏi chat_groups cùng dấu group_accounts (nếu còn sót). */
export function pruneLeftGroups(db: Db, now: number, retentionMs: number): { groups: number; groupAccounts: number } {
  const cutoff = now - retentionMs
  return db.transaction(() => {
    const groupAccounts = db.prepare(`DELETE FROM group_accounts WHERE zalo_group_id IN
      (SELECT zalo_group_id FROM chat_groups WHERE left_at IS NOT NULL AND left_at < ?)`).run(cutoff).changes
    const groups = db.prepare('DELETE FROM chat_groups WHERE left_at IS NOT NULL AND left_at < ?').run(cutoff).changes
    return { groups, groupAccounts }
  })()
}

/**
 * Người bắn không thấy tin nào quá retentionMs VÀ không còn cuốc còn hạn trong rides: xoá (gồm mã QR
 * đã lấy). Họ đăng tin lại thì được tạo lại và lấy mã QR mới như người mới.
 */
export function pruneStaleSenders(db: Db, now: number, retentionMs: number): number {
  return db.prepare(`DELETE FROM senders WHERE COALESCE(last_seen_at, 0) < ?
    AND NOT EXISTS (SELECT 1 FROM rides r WHERE r.sender_uid = senders.uid AND r.expires_at > ?)`).run(now - retentionMs, now).changes
}
