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
        const { status } = await this.deps.send('/api/internal/zalo/rides', { rides: batch })
        if (status !== 200) {
          this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 60_000)
          this.retryAt = now + this.backoffMs
          this.deps.logger.error(`Gửi ${batch.length} cuốc sang Laravel lỗi HTTP ${status || 'mạng'} — thử lại sau ${this.backoffMs}ms`)
          return
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
    const groups = this.deps.db.prepare(`
      SELECT g.zalo_group_id, g.name, g.last_message_at,
        (SELECT COUNT(*) FROM messages m WHERE m.zalo_group_id = g.zalo_group_id AND m.sent_at >= ?) AS messages_24h
      FROM chat_groups g ORDER BY g.zalo_group_id`).all(since)
    const { status } = await this.deps.send('/api/internal/zalo/groups', { groups })
    if (status !== 200) this.deps.logger.error('Đồng bộ danh sách nhóm lỗi HTTP', status || 'mạng')
  }
}
