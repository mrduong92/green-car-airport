import type Database from 'better-sqlite3'
import type { Db } from './db.js'
import type { MessageItem } from './normalize.js'
import { contentHash } from './text.js'

export type SaveResult = 'stored' | 'duplicate' | 'ignored'

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
  private readonly saveTx: (item: MessageItem, accountId: string, receivedAt: number) => SaveResult

  constructor(db: Db, private readonly opts: StoreOptions) {
    this.exists = db.prepare('SELECT 1 FROM messages WHERE zalo_group_id = ? AND zalo_msg_id = ?')
    this.seenHash = db.prepare('SELECT 1 FROM messages WHERE content_hash = ? AND sent_at >= ? LIMIT 1')
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

    this.saveTx = db.transaction((item: MessageItem, accountId: string, receivedAt: number): SaveResult => {
      if (this.exists.get(item.group_id, item.msg_id)) return 'ignored'

      this.upsertGroup.run(item.group_id, item.group_name.slice(0, MAX_NAME), item.sent_at)
      this.upsertSender.run(item.sender_uid, item.sender_name.slice(0, MAX_NAME), item.sent_at)

      const hash = contentHash(item.sender_uid, item.content)
      const isDuplicate = Boolean(this.seenHash.get(hash, item.sent_at - this.opts.duplicateWindowMs))

      this.insert.run({
        groupId: item.group_id,
        msgId: item.msg_id,
        senderUid: item.sender_uid,
        accountId,
        content: item.content.slice(0, this.opts.maxContentLength),
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

  prune(now: number = Date.now()): number {
    return this.deleteOld.run(now - this.opts.retentionMs).changes
  }
}
