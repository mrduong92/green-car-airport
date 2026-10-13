import type { Db } from './db.js'
import { looksTimed } from './text.js'

export interface StatsReport {
  total: number
  duplicates: number
  unique: number
  timed: number
  senders: number
  groups: number
  topGroups: { name: string; total: number }[]
}

// Số liệu để chốt chi phí AI với GreenCA sau 2–3 ngày thu thập.
export function computeStats(db: Db, hours: number, now: number = Date.now()): StatsReport {
  const from = now - hours * 3_600_000
  const one = (sql: string) => (db.prepare(sql).get(from) as { c: number }).c

  const total = one('SELECT COUNT(*) AS c FROM messages WHERE sent_at >= ?')
  const duplicates = one("SELECT COUNT(*) AS c FROM messages WHERE sent_at >= ? AND parse_status = 'duplicate'")

  let timed = 0
  const rows = db.prepare("SELECT content FROM messages WHERE sent_at >= ? AND parse_status <> 'duplicate'").iterate(from)
  for (const row of rows as Iterable<{ content: string }>) {
    if (looksTimed(row.content)) timed++
  }

  const topGroups = db.prepare(`
    SELECT COALESCE(NULLIF(g.name, ''), m.zalo_group_id) AS name, COUNT(*) AS total
    FROM messages m LEFT JOIN chat_groups g ON g.zalo_group_id = m.zalo_group_id
    WHERE m.sent_at >= ?
    GROUP BY m.zalo_group_id ORDER BY total DESC LIMIT 10`).all(from) as { name: string; total: number }[]

  return {
    total,
    duplicates,
    unique: total - duplicates,
    timed,
    senders: one('SELECT COUNT(DISTINCT sender_uid) AS c FROM messages WHERE sent_at >= ?'),
    groups: one('SELECT COUNT(DISTINCT zalo_group_id) AS c FROM messages WHERE sent_at >= ?'),
    topGroups,
  }
}

export function formatStats(r: StatsReport, hours: number): string {
  if (r.total === 0) return `Chưa có tin nào trong ${hours} giờ qua`

  const pct = (part: number, whole: number) => `${part} (${whole > 0 ? ((part * 100) / whole).toFixed(1) : '0.0'}%)`
  return [
    `Thống kê ${hours} giờ qua`,
    `Tổng tin: ${r.total}`,
    `Tin trùng (bỏ qua): ${pct(r.duplicates, r.total)}`,
    `Tin không trùng: ${r.unique}`,
    `  trong đó có dấu hiệu giờ (giống cuốc): ${pct(r.timed, r.unique)}`,
    `Số người gửi: ${r.senders}`,
    `Số nhóm có tin: ${r.groups}`,
    'Top nhóm nhiều tin:',
    ...r.topGroups.map((g) => `  ${g.total}\t${g.name}`),
  ].join('\n')
}
