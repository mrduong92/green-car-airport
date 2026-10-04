import type Database from 'better-sqlite3'
import type { Db } from './db.js'

export type QrStatus = 'ok' | 'empty' | 'error'

// Mã deeplink của người gửi: zalo://qr/p/<qr_code> mở trang cá nhân Zalo của họ.
export class SenderStore {
  private readonly getQr: Database.Statement
  private readonly setQr: Database.Statement
  private readonly statsStmt: Database.Statement

  constructor(db: Db) {
    this.getQr = db.prepare('SELECT qr_code, qr_fetched_at, qr_status FROM senders WHERE uid = ?')
    this.setQr = db.prepare('UPDATE senders SET qr_code = ?, qr_status = ?, qr_fetched_at = ? WHERE uid = ?')
    this.statsStmt = db.prepare('SELECT qr_status, COUNT(*) AS c FROM senders WHERE qr_fetched_at >= ? GROUP BY qr_status')
  }

  qr(uid: string): { code: string | null; fetchedAt: number | null; status: QrStatus | null } {
    const row = this.getQr.get(uid) as { qr_code: string | null; qr_fetched_at: number | null; qr_status: QrStatus | null } | undefined
    return { code: row?.qr_code ?? null, fetchedAt: row?.qr_fetched_at ?? null, status: row?.qr_status ?? null }
  }

  // Lỗi tạm thời (status 'error') giữ lại mã cũ nếu đã có.
  saveQr(uid: string, code: string | null, status: QrStatus, at: number): void {
    const keep = status === 'error' ? this.qr(uid).code : code
    this.setQr.run(keep, status, at, uid)
  }

  // Số người bắn theo kết quả lấy mã từ mốc since (heartbeat: tỷ lệ 'empty' tăng vọt = giải mã QR hỏng âm thầm).
  qrStats(since: number): { ok: number; empty: number; error: number } {
    const out = { ok: 0, empty: 0, error: 0 }
    for (const row of this.statsStmt.all(since) as { qr_status: QrStatus | null; c: number }[]) {
      if (row.qr_status && row.qr_status in out) out[row.qr_status] = row.c
    }
    return out
  }
}
