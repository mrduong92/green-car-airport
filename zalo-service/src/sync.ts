import type { Db } from './db.js'
import type { Sender } from './http.js'
import type { Logger } from './logger.js'
import type { RideStore } from './rides.js'

/**
 * Hộp thư đi → Laravel: gửi tuần tự từng lô ≤ batchSize tới khi hết; Laravel lỗi thì giữ nguyên và chờ lùi dần
 * (1s → 60s). index.ts gọi flush() mỗi ridesFlushMs (2 giây). Chỉ cuốc của người bắn đã có mã QR được
 * RideStore.unsynced() chọn ra.
 */
export class RideSync {
  private running = false
  private retryAt = 0
  private backoffMs = 0

  constructor(private readonly deps: { rides: RideStore; send: Sender; batchSize?: number; logger: Logger; now?: () => number }) {}

  async flush(): Promise<void> {
    const now = (this.deps.now ?? Date.now)()
    if (this.running || now < this.retryAt) return
    this.running = true
    try {
      for (;;) {
        const at = (this.deps.now ?? Date.now)()
        const batch = this.deps.rides.unsynced(this.deps.batchSize ?? 100)
        if (batch.length === 0) return
        const { status, body } = await this.deps.send('/api/internal/zalo/rides', { rides: batch })
        if (status !== 200) {
          this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 60_000)
          this.retryAt = now + this.backoffMs
          this.deps.logger.error(`Gửi ${batch.length} cuốc sang Laravel lỗi HTTP ${status || 'mạng'} — thử lại sau ${this.backoffMs}ms`)
          return
        }
        // Cuốc Laravel loại (sai dữ liệu) vẫn đánh dấu đã gửi — gửi lại cũng bị loại y hệt và chặn hộp thư đi.
        // Laravel ghi lý do vào log; ở đây báo số lượng để không mất cuốc âm thầm.
        const rejected = (body as { rejected?: unknown } | undefined)?.rejected
        if (Array.isArray(rejected) && rejected.length > 0) {
          const uids = rejected.map((i) => batch[i as number]?.ride_uid).filter(Boolean)
          this.deps.logger.warn(`Laravel loại ${rejected.length} cuốc trong lô ${batch.length} (xem log Laravel): ${uids.join(', ')}`)
        }
        this.deps.rides.markSynced(batch.map((r) => r.ride_uid), at)
        this.backoffMs = 0
        this.retryAt = 0
        // Lô chưa đầy = đã gửi hết; cuốc đổi trong lúc gửi để lượt sau — tránh vòng lặp không dứt khi
        // cuốc cứ bị đổi (updated_at > at) giữa hai lần gửi.
        if (batch.length < (this.deps.batchSize ?? 100)) return
      }
    } finally {
      this.running = false
    }
  }
}

// Danh sách nhóm + số tin 24 giờ cho trang admin (mỗi 10 phút).
export class GroupsSync {
  constructor(private readonly deps: { db: Db; send: Sender; logger: Logger; now?: () => number }) {}

  async flush(): Promise<void> {
    const since = (this.deps.now ?? Date.now)() - 24 * 3_600_000
    // Một lần GROUP BY trên khoảng sent_at (index messages_sent) thay vì đếm lại cho từng nhóm (~300 nhóm).
    const groups = this.deps.db.prepare(`
      SELECT g.zalo_group_id, g.name, g.last_message_at, COALESCE(c.n, 0) AS messages_24h
      FROM chat_groups g
      LEFT JOIN (SELECT zalo_group_id, COUNT(*) AS n FROM messages WHERE sent_at >= ? GROUP BY zalo_group_id) c
        ON c.zalo_group_id = g.zalo_group_id
      ORDER BY g.zalo_group_id`).all(since)
    const { status } = await this.deps.send('/api/internal/zalo/groups', { groups })
    if (status !== 200) this.deps.logger.error('Đồng bộ danh sách nhóm lỗi HTTP', status || 'mạng')
  }
}
