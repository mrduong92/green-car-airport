import type Database from 'better-sqlite3'
import type { Db } from './db.js'
import type { MessageItem } from './normalize.js'
import { contentHash, truncate } from './text.js'

export type SaveResult = 'stored' | 'duplicate' | 'ignored'

export type MessageStatus =
  | 'pending' | 'duplicate' | 'not_ride' | 'ride' | 'raw' | 'ai_pending' | 'blocked' | 'skipped_group' | 'expired'

export interface StoredMessage {
  id: number
  zalo_group_id: string
  sender_uid: string
  content: string
  sent_at: number
  parse_status: MessageStatus
}

export interface StoreOptions {
  duplicateWindowMs: number
  maxContentLength: number
  retentionMs: number
}

const MAX_NAME = 255

/**
 * Lưu tin thô — nguyên tắc "lưu ngay khi nhận": gọi đồng bộ trong một transaction.
 * - Idempotent theo (nhóm, msg_id): 2 tài khoản phụ cùng ở một nhóm nghe cùng một tin → lưu 1 lần.
 * - duplicate: cùng người gửi + cùng nội dung đã chuẩn hoá, sent_at cách nhau ≤ duplicateWindowMs.
 * - Tên rỗng không ghi đè tên đã biết; nội dung/tên quá dài thì cắt, không từ chối.
 */
export class MessageStore {
  private readonly exists: Database.Statement
  private readonly seenHash: Database.Statement
  private readonly insert: Database.Statement
  private readonly upsertGroup: Database.Statement
  private readonly upsertSender: Database.Statement
  private readonly deleteOld: Database.Statement
  private readonly renameGroup: Database.Statement
  private readonly findStmt: Database.Statement
  private readonly getStmt: Database.Statement
  private readonly statusStmt: Database.Statement
  private readonly byStatusStmt: Database.Statement
  private readonly expireStmt: Database.Statement
  private readonly saveTx: (item: MessageItem, accountId: string, receivedAt: number) => SaveResult

  constructor(db: Db, private readonly opts: StoreOptions) {
    this.exists = db.prepare('SELECT 1 FROM messages WHERE zalo_group_id = ? AND zalo_msg_id = ?')
    // Chỉ so với tin GỐC (không phải duplicate): đăng lại cùng cuốc mỗi sáng thì mỗi ngày là tin mới,
    // không bị chuỗi duplicate nối dài cửa sổ 24h mãi mãi.
    this.seenHash = db.prepare("SELECT 1 FROM messages WHERE content_hash = ? AND sent_at >= ? AND parse_status <> 'duplicate' LIMIT 1")
    this.insert = db.prepare(`
      INSERT INTO messages (zalo_group_id, zalo_msg_id, sender_uid, account_id, content, content_hash, sent_at, received_at, parse_status)
      VALUES (@groupId, @msgId, @senderUid, @accountId, @content, @hash, @sentAt, @receivedAt, @status)`)
    this.upsertGroup = db.prepare(`
      INSERT INTO chat_groups (zalo_group_id, name, last_message_at) VALUES (?, ?, ?)
      ON CONFLICT (zalo_group_id) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE chat_groups.name END,
        last_message_at = MAX(COALESCE(chat_groups.last_message_at, 0), excluded.last_message_at)`)
    this.upsertSender = db.prepare(`
      INSERT INTO senders (uid, display_name, last_seen_at) VALUES (?, ?, ?)
      ON CONFLICT (uid) DO UPDATE SET
        display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE senders.display_name END,
        last_seen_at = MAX(COALESCE(senders.last_seen_at, 0), excluded.last_seen_at)`)
    this.deleteOld = db.prepare('DELETE FROM messages WHERE sent_at < ?')
    this.renameGroup = db.prepare("UPDATE chat_groups SET name = ? WHERE zalo_group_id = ? AND ? <> ''")
    this.findStmt = db.prepare('SELECT id FROM messages WHERE zalo_group_id = ? AND zalo_msg_id = ?')
    this.getStmt = db.prepare('SELECT id, zalo_group_id, sender_uid, content, sent_at, parse_status FROM messages WHERE id = ?')
    this.statusStmt = db.prepare('UPDATE messages SET parse_status = ? WHERE id = ?')
    this.byStatusStmt = db.prepare('SELECT id FROM messages WHERE parse_status = ? AND sent_at >= ? ORDER BY id')
    this.expireStmt = db.prepare("UPDATE messages SET parse_status = 'expired' WHERE parse_status IN ('pending', 'ai_pending') AND sent_at < ?")

    this.saveTx = db.transaction((item: MessageItem, accountId: string, receivedAt: number): SaveResult => {
      if (this.exists.get(item.group_id, item.msg_id)) return 'ignored'

      this.upsertGroup.run(item.group_id, truncate(item.group_name, MAX_NAME), item.sent_at)
      this.upsertSender.run(item.sender_uid, truncate(item.sender_name, MAX_NAME), item.sent_at)

      const hash = contentHash(item.sender_uid, item.content)
      const isDuplicate = Boolean(this.seenHash.get(hash, item.sent_at - this.opts.duplicateWindowMs))

      this.insert.run({
        groupId: item.group_id,
        msgId: item.msg_id,
        senderUid: item.sender_uid,
        accountId,
        content: truncate(item.content, this.opts.maxContentLength),
        hash,
        sentAt: item.sent_at,
        receivedAt,
        status: isDuplicate ? 'duplicate' : 'pending',
      })
      return isDuplicate ? 'duplicate' : 'stored'
    })
  }

  save(item: MessageItem, accountId: string, receivedAt: number = Date.now()): SaveResult {
    return this.saveTx(item, accountId, receivedAt)
  }

  // Tên nhóm tra được sau khi tin đã lưu (ingest không chờ Zalo). Tên rỗng không ghi đè.
  setGroupName(groupId: string, name: string): void {
    const trimmed = truncate(name, MAX_NAME)
    this.renameGroup.run(trimmed, groupId, trimmed)
  }

  findId(groupId: string, msgId: string): number | undefined {
    return (this.findStmt.get(groupId, msgId) as { id: number } | undefined)?.id
  }

  get(id: number): StoredMessage | undefined {
    return this.getStmt.get(id) as StoredMessage | undefined
  }

  setStatus(id: number, status: MessageStatus): void {
    this.statusStmt.run(status, id)
  }

  idsByStatus(status: MessageStatus, sinceSentAt: number): number[] {
    return (this.byStatusStmt.all(status, sinceSentAt) as { id: number }[]).map((r) => r.id)
  }

  // Tin dở dang (pending/ai_pending) gửi trước mốc before → 'expired' (quá cũ để còn là cuốc). Trả số tin.
  expireUnprocessed(before: number): number {
    return this.expireStmt.run(before).changes
  }

  prune(now: number = Date.now()): number {
    return this.deleteOld.run(now - this.opts.retentionMs).changes
  }
}
