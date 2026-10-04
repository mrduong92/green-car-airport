import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Db } from './db.js'
import type { Direction, RideDraft } from './parser/rules.js'
import { contentHash, normalize } from './text.js'

export interface RideSource {
  messageId: number
  senderUid: string
  groupId: string
  sentAt: number
}

// Đúng định dạng POST /api/internal/zalo/rides (Laravel ZaloRideIngestService).
// qr_code không null: unsynced()/backlog() chỉ trả cuốc của người bắn đang có mã QR (quyết định GreenCA —
// người tắt "Mã QR của tôi" bị bỏ qua, xem task-5 overrides).
export interface RidePayload {
  ride_uid: string
  sender_uid: string
  sender_name: string
  qr_code: string
  zalo_group_id: string
  group_name: string
  direction: Direction | null
  pickup: string | null
  destination: string | null
  pickup_at: number | null
  pickup_time_text: string | null
  seats: number | null
  vehicle_note: string | null
  price: number | null
  is_free: boolean
  is_raw: boolean
  raw_text: string
  group_count: number
  posted_at: number
  expires_at: number
}

const HALF_HOUR = 30 * 60_000
const DAY = 24 * 3_600_000

/**
 * Hộp thư đi: cuốc sạch chờ gửi Laravel. Cuốc "cần gửi" khi chưa đồng bộ hoặc đổi sau lần đồng bộ cuối
 * (updated_at > synced_at), CÒN HẠN (expires_at > now — cuốc hết hạn gửi sang cũng vô ích, không làm tồn
 * hộp thư đi), VÀ người bắn có mã QR (qr_code IS NOT NULL — không đòi qr_status = 'ok': lần getQR lỗi tạm
 * thời đặt 'error' nhưng giữ mã cũ vẫn dùng được; 'empty' thì mã bị xoá về NULL nên vẫn bị giữ lại).
 * Cuốc của người chưa có/đã tắt mã QR ở lại bảng (đếm bằng heldBack()), chờ markSenderChanged khi mã về,
 * và bị prune() dọn khi hết hạn quá 1 ngày dù chưa từng gửi được. Cùng người bắn + chiều + điểm đón/đến +
 * khung 30 phút = một cuốc (gộp, tăng group_count).
 */
export class RideStore {
  private readonly now: () => number
  private readonly uid: () => string
  private readonly findByFp: Database.Statement
  private readonly bump: Database.Statement
  private readonly insert: Database.Statement
  private readonly bumpDup: Database.Statement
  private readonly senderChanged: Database.Statement
  private readonly selectUnsynced: Database.Statement
  private readonly countBacklog: Database.Statement
  private readonly countHeldBack: Database.Statement
  private readonly deleteOld: Database.Statement
  private readonly upsertTx: (source: RideSource, drafts: RideDraft[]) => { created: number; merged: number }

  constructor(private readonly db: Db, private readonly opts: { expireAfterPickupMs: number; expireWithoutTimeMs: number; now?: () => number; uid?: () => string }) {
    this.now = opts.now ?? (() => Date.now())
    this.uid = opts.uid ?? (() => randomUUID())
    this.findByFp = db.prepare('SELECT id FROM rides WHERE fingerprint = ? AND expires_at > ? LIMIT 1')
    this.bump = db.prepare('UPDATE rides SET group_count = group_count + 1, updated_at = ? WHERE id = ?')
    this.insert = db.prepare(`
      INSERT INTO rides (ride_uid, message_id, sender_uid, zalo_group_id, direction, pickup, destination, pickup_at,
        pickup_time_text, seats, vehicle_note, price, is_free, is_raw, raw_text, fingerprint, posted_at, expires_at, updated_at)
      VALUES (@ride_uid, @message_id, @sender_uid, @zalo_group_id, @direction, @pickup, @destination, @pickup_at,
        @pickup_time_text, @seats, @vehicle_note, @price, @is_free, @is_raw, @raw_text, @fingerprint, @posted_at, @expires_at, @updated_at)`)
    this.bumpDup = db.prepare(`
      UPDATE rides SET group_count = group_count + 1, updated_at = ?
      WHERE expires_at > ? AND message_id IN (
        SELECT id FROM messages WHERE sender_uid = ? AND content_hash = ? AND parse_status IN ('ride', 'raw'))`)
    this.senderChanged = db.prepare('UPDATE rides SET updated_at = ? WHERE sender_uid = ? AND expires_at > ?')
    // INNER JOIN senders có điều kiện mã QR: cuốc của người chưa/không còn mã QR không được chọn ra, dù
    // vẫn còn nằm trong bảng rides (không bị LEFT JOIN cho qua với qr_code NULL).
    this.selectUnsynced = db.prepare(`
      SELECT r.*, COALESCE(s.display_name, '') AS sender_name, s.qr_code AS qr_code, COALESCE(g.name, '') AS group_name
      FROM rides r
      JOIN senders s ON s.uid = r.sender_uid AND s.qr_code IS NOT NULL
      LEFT JOIN chat_groups g ON g.zalo_group_id = r.zalo_group_id
      WHERE (r.synced_at IS NULL OR r.updated_at > r.synced_at) AND r.expires_at > ?
      ORDER BY r.updated_at
      LIMIT ?`)
    this.countBacklog = db.prepare(`
      SELECT COUNT(*) AS c FROM rides r
      JOIN senders s ON s.uid = r.sender_uid AND s.qr_code IS NOT NULL
      WHERE (r.synced_at IS NULL OR r.updated_at > r.synced_at) AND r.expires_at > ?`)
    // Cuốc còn hạn, chưa gửi, bị giữ lại vì người bắn chưa/không có mã QR (kể cả chưa có hàng senders).
    this.countHeldBack = db.prepare(`
      SELECT COUNT(*) AS c FROM rides r
      LEFT JOIN senders s ON s.uid = r.sender_uid
      WHERE s.qr_code IS NULL AND (r.synced_at IS NULL OR r.updated_at > r.synced_at) AND r.expires_at > ?`)
    this.deleteOld = db.prepare('DELETE FROM rides WHERE expires_at < ?')

    this.upsertTx = db.transaction((source: RideSource, drafts: RideDraft[]) => {
      let created = 0
      let merged = 0
      const now = this.now()
      for (const draft of drafts) {
        const fingerprint = this.fingerprint(source.senderUid, draft)
        const existing = this.findByFp.get(fingerprint, now) as { id: number } | undefined
        if (existing) {
          this.bump.run(now, existing.id)
          merged++
          continue
        }
        this.insertRow(source, draft, fingerprint, false, now)
        created++
      }
      return { created, merged }
    })
  }

  upsertDrafts(source: RideSource, drafts: RideDraft[]): { created: number; merged: number } {
    return this.upsertTx(source, drafts)
  }

  addRaw(source: RideSource, rawText: string): void {
    const draft: RideDraft = {
      direction: null, pickup: null, destination: null, pickupAt: null, pickupTimeText: null,
      seats: null, vehicleNote: null, price: null, isFree: false, rawText,
    }
    this.insertRow(source, draft, `raw|${contentHash(source.senderUid, rawText)}`, true, this.now())
  }

  bumpForDuplicate(senderUid: string, hash: string): number {
    const now = this.now()
    return this.bumpDup.run(now, now, senderUid, hash).changes
  }

  markSenderChanged(senderUid: string): number {
    const now = this.now()
    return this.senderChanged.run(now, senderUid, now).changes
  }

  unsynced(limit: number): RidePayload[] {
    return (this.selectUnsynced.all(this.now(), limit) as Record<string, unknown>[]).map((r) => ({
      ride_uid: r.ride_uid as string,
      sender_uid: r.sender_uid as string,
      sender_name: r.sender_name as string,
      qr_code: r.qr_code as string,
      zalo_group_id: r.zalo_group_id as string,
      group_name: r.group_name as string,
      direction: (r.direction as Direction | null) ?? null,
      pickup: (r.pickup as string | null) ?? null,
      destination: (r.destination as string | null) ?? null,
      pickup_at: (r.pickup_at as number | null) ?? null,
      pickup_time_text: (r.pickup_time_text as string | null) ?? null,
      seats: (r.seats as number | null) ?? null,
      vehicle_note: (r.vehicle_note as string | null) ?? null,
      price: (r.price as number | null) ?? null,
      is_free: r.is_free === 1,
      is_raw: r.is_raw === 1,
      raw_text: r.raw_text as string,
      group_count: r.group_count as number,
      posted_at: r.posted_at as number,
      expires_at: r.expires_at as number,
    }))
  }

  // at = thời điểm lấy lô (trước khi gửi): cuốc đổi trong lúc đang gửi có updated_at > at → gửi lại lượt sau.
  markSynced(rideUids: string[], at: number): void {
    if (rideUids.length === 0) return
    const placeholders = rideUids.map(() => '?').join(',')
    this.db.prepare(`UPDATE rides SET synced_at = ? WHERE ride_uid IN (${placeholders})`).run(at, ...rideUids)
  }

  backlog(): number {
    return (this.countBacklog.get(this.now()) as { c: number }).c
  }

  heldBack(): number {
    return (this.countHeldBack.get(this.now()) as { c: number }).c
  }

  prune(now: number = this.now()): number {
    return this.deleteOld.run(now - DAY).changes
  }

  private fingerprint(senderUid: string, draft: RideDraft): string {
    const slot = draft.pickupAt === null ? '' : String(Math.round(draft.pickupAt / HALF_HOUR))
    const key = [senderUid, draft.direction ?? '', normalize(draft.pickup ?? ''), normalize(draft.destination ?? ''), slot].join('|')
    return createHash('sha256').update(key).digest('hex')
  }

  private insertRow(source: RideSource, draft: RideDraft, fingerprint: string, isRaw: boolean, now: number): void {
    const expiresAt = draft.pickupAt !== null ? draft.pickupAt + this.opts.expireAfterPickupMs : source.sentAt + this.opts.expireWithoutTimeMs
    this.insert.run({
      ride_uid: this.uid(),
      message_id: source.messageId,
      sender_uid: source.senderUid,
      zalo_group_id: source.groupId,
      direction: draft.direction,
      pickup: draft.pickup,
      destination: draft.destination,
      pickup_at: draft.pickupAt,
      pickup_time_text: draft.pickupTimeText,
      seats: draft.seats,
      vehicle_note: draft.vehicleNote,
      price: draft.price,
      is_free: draft.isFree ? 1 : 0,
      is_raw: isRaw ? 1 : 0,
      raw_text: draft.rawText,
      fingerprint,
      posted_at: source.sentAt,
      expires_at: expiresAt,
      updated_at: now,
    })
  }
}
