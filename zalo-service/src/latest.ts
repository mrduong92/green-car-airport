import type { Db } from './db.js'

export interface LatestMessage {
  sent_at: number
  group_name: string
  sender_uid: string
  sender_name: string
  content: string
  parse_status: string
  deep_link: string | null
  qr_status: string | null
}

// Tin mới nhất kèm deeplink người gửi — để kiểm tra luồng (npm run latest).
export function latestMessages(db: Db, limit: number): LatestMessage[] {
  return db.prepare(`
    SELECT m.sent_at, COALESCE(g.name, '') AS group_name, m.sender_uid, COALESCE(s.display_name, '') AS sender_name,
      m.content, m.parse_status,
      CASE WHEN s.qr_code IS NOT NULL THEN 'zalo://qr/p/' || s.qr_code END AS deep_link, s.qr_status
    FROM messages m
    LEFT JOIN chat_groups g ON g.zalo_group_id = m.zalo_group_id
    LEFT JOIN senders s ON s.uid = m.sender_uid
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT ?`).all(limit) as LatestMessage[]
}
