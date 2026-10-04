import type { AiOutcome, AiQueue } from './ai/queue.js'
import type { Logger } from './logger.js'
import { parseRides } from './parser/rules.js'
import type { QrQueue } from './qr.js'
import type { RemoteConfig } from './remote-config.js'
import type { RideSource, RideStore } from './rides.js'
import type { MessageStore, StoredMessage } from './store.js'
import { contentHash } from './text.js'

// Điều phối xử lý MỘT tin đã lưu (sơ đồ 6.2): nhóm tắt / người bắn bị chặn → quy tắc → AI hoặc nguyên văn.
// Chỉ lấy mã QR (qr.ensure) cho người bắn có tin thành cuốc — ít lời gọi getQR hơn, giảm rủi ro Zalo khoá tài khoản.
export class Processor {
  constructor(
    private readonly deps: {
      messages: MessageStore
      rides: RideStore
      ai: AiQueue | null
      qr: QrQueue
      config: () => RemoteConfig
      logger: Logger
      // Tuổi thọ cuốc không ghi giờ (cfg.rideExpireWithoutTimeMs): tin dở dang cũ hơn thế lúc khởi động bị bỏ.
      rideExpireWithoutTimeMs: number
    },
  ) {}

  handleStored(messageId: number): void {
    const msg = this.deps.messages.get(messageId)
    if (!msg) return
    const config = this.deps.config()

    if (config.disabledGroupIds.has(msg.zalo_group_id)) return this.deps.messages.setStatus(msg.id, 'skipped_group')
    if (config.blockedSenderUids.has(msg.sender_uid)) return this.deps.messages.setStatus(msg.id, 'blocked')

    const outcome = parseRides(msg.content, msg.sent_at)
    if (outcome.kind === 'not_ride') return this.deps.messages.setStatus(msg.id, 'not_ride')
    if (outcome.kind === 'rides') {
      this.deps.rides.upsertDrafts(this.source(msg), outcome.rides)
      this.deps.messages.setStatus(msg.id, 'ride')
      this.deps.qr.ensure(msg.sender_uid)
      return
    }

    if (this.deps.ai) {
      this.deps.messages.setStatus(msg.id, 'ai_pending')
      this.deps.ai.enqueue({ id: msg.id, content: msg.content, sentAt: msg.sent_at })
    } else {
      this.markRaw(msg.id)
    }
  }

  handleDuplicate(senderUid: string, content: string): void {
    this.deps.rides.bumpForDuplicate(senderUid, contentHash(senderUid, content))
  }

  applyAi(outcome: AiOutcome): void {
    const msg = this.deps.messages.get(outcome.id)
    if (!msg) return
    if (!outcome.isRide) return this.deps.messages.setStatus(msg.id, 'not_ride')
    this.deps.rides.upsertDrafts(this.source(msg), outcome.rides)
    this.deps.messages.setStatus(msg.id, 'ride')
    this.deps.qr.ensure(msg.sender_uid)
  }

  // Không có AI / hết ngân sách AI: vẫn hiển thị nguyên văn để tab Free không mất cuốc.
  markRaw(messageId: number): void {
    const msg = this.deps.messages.get(messageId)
    if (!msg) return
    this.deps.rides.addRaw(this.source(msg), msg.content)
    this.deps.messages.setStatus(msg.id, 'raw')
    this.deps.qr.ensure(msg.sender_uid)
  }

  // Khởi động lại: tin đang chờ AI bị mất khỏi hàng đợi trong RAM; tin pending có thể chưa kịp xử lý.
  // Lần chạy đầu / ngừng lâu có thể tồn hàng nghìn tin: tin cũ hơn rideExpireWithoutTimeMs → 'expired' ngay,
  // không gọi AI, không getQR (đỡ tốn ngân sách AI và đỡ dồn lời gọi Zalo cho cuốc đã quá giờ).
  recover(now: number): void {
    const since = now - this.deps.rideExpireWithoutTimeMs
    const expired = this.deps.messages.expireUnprocessed(since)
    if (expired > 0) this.deps.logger.info(`Bỏ ${expired} tin dở dang quá cũ (trạng thái expired)`)
    for (const id of this.deps.messages.idsByStatus('ai_pending', since)) {
      const msg = this.deps.messages.get(id)
      if (msg && this.deps.ai) this.deps.ai.enqueue({ id, content: msg.content, sentAt: msg.sent_at })
      else if (msg) this.markRaw(id)
    }
    for (const id of this.deps.messages.idsByStatus('pending', since)) this.handleStored(id)
    this.deps.logger.info('Đã xếp lại tin dở dang sau khi khởi động')
  }

  private source(msg: StoredMessage): RideSource {
    return { messageId: msg.id, senderUid: msg.sender_uid, groupId: msg.zalo_group_id, sentAt: msg.sent_at }
  }
}

// AI lỗi hết số lần thử → vẫn hiển thị nguyên văn (không bỏ cuốc). getProcessor vì Processor tạo sau AiQueue.
export function onAiFailed(getProcessor: () => Processor | undefined, logger: Logger): (id: number) => void {
  return (id) => {
    logger.warn(`AI lỗi quá số lần thử cho tin ${id} — hiển thị nguyên văn`)
    getProcessor()?.markRaw(id)
  }
}
