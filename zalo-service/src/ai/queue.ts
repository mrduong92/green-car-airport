import type { Logger } from '../logger.js'
import type { RideDraft } from '../parser/rules.js'
import type { AiUsage } from './usage.js'

export interface AiItem {
  id: number
  content: string
  sentAt: number
}

export interface AiOutcome {
  id: number
  isRide: boolean
  rides: RideDraft[]
}

export interface Extractor {
  extract(items: AiItem[]): Promise<{ outcomes: AiOutcome[]; inputTokens: number; outputTokens: number }>
}

// Lỗi gọi AI có kèm usage (khi đã có phản hồi từ API nhưng không dùng được — parse lỗi,
// parsed_output rỗng, model từ chối trả lời...) để hàng chờ vẫn tính phí vào ngân sách
// dù lần gọi đó thất bại. Khi lỗi xảy ra trước khi có phản hồi (mất mạng, SDK từ chối gửi
// yêu cầu...) thì không có usage để tính.
export class AiCallError extends Error {
  readonly usage?: { input_tokens: number; output_tokens: number }

  constructor(message: string, usage?: { input_tokens: number; output_tokens: number }) {
    super(message)
    this.name = 'AiCallError'
    this.usage = usage
  }
}

/**
 * Hàng chờ AI: gom tin khó thành lô (≤ batchSize), gọi tuần tự, tôn trọng trần ngân sách theo ngày.
 * Lô lỗi: tạm dừng retryPauseMs rồi thử lại; mỗi tin tối đa maxAttempts lần rồi báo onFailed.
 * Giãn nhịp "≤ batchSize tin hoặc mỗi aiFlushMs": hẹn giờ gọi flush() mỗi aiFlushMs nằm ở index.ts,
 * CÒN enqueue() tự gọi flush() ngay khi đủ một lô — không đợi hẹn giờ nếu tin đổ về nhanh hơn nhịp đó.
 * flush() xử lý HẾT hàng đợi hiện có (nhiều lô liên tiếp), không chỉ một lô — tin đổ về nhanh hơn
 * aiFlushMs/batchSize không được tồn đọng vô hạn.
 */
export class AiQueue {
  private readonly items: AiItem[] = []
  private readonly attempts = new Map<number, number>()
  private pausedUntil = 0
  // Một lượt "rút cạn" hàng đợi đang chạy (nếu có) — gọi flush() khi đã có lượt đang chạy (từ hẹn giờ,
  // từ enqueue() khi đầy lô, hoặc gọi tay) trả về ĐÚNG promise đó thay vì no-op, để bên gọi luôn có một
  // điểm chờ đáng tin cậy (đợi xong lượt đang chạy) thay vì đợi "không làm gì cả".
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly deps: {
      extractor: Extractor
      usage: AiUsage
      budgetUsd: () => number
      onOutcome: (outcome: AiOutcome) => void
      onOverBudget: (id: number) => void
      onFailed: (id: number) => void
      batchSize?: number
      maxAttempts?: number
      retryPauseMs?: number
      logger: Logger
      now?: () => number
    },
  ) {}

  get size(): number {
    return this.items.length
  }

  enqueue(item: AiItem): void {
    this.items.push(item)
    // Đủ một lô đầy → gọi AI ngay, không đợi hẹn giờ aiFlushMs (tin đổ về nhanh hơn nhịp 30 giây thì
    // backlog không được phép tăng vô hạn). Không await (enqueue là hàm đồng bộ); flush() tự chặn
    // chạy chồng qua inFlight nên gọi nhiều lần liên tiếp vẫn an toàn.
    if (this.items.length >= (this.deps.batchSize ?? 20)) {
      this.flush().catch((err) => this.deps.logger.error('Tự động gọi AI khi đầy lô lỗi:', err instanceof Error ? err.message : err))
    }
  }

  // Gọi callback người dùng (onOutcome/onOverBudget/onFailed) tách khỏi try/catch của lần gọi AI:
  // callback ném lỗi không được hiểu nhầm là lần gọi AI thất bại (tránh gửi lại cả lô đã xử lý xong).
  private safeCall(fn: () => void, label: string): void {
    try {
      fn()
    } catch (err) {
      this.deps.logger.error(`Callback ${label} lỗi:`, err instanceof Error ? err.message : err)
    }
  }

  flush(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.drain().finally(() => {
        this.inFlight = null
      })
    }
    return this.inFlight
  }

  // Rút cạn hàng đợi hiện có, không chỉ một lô: tin mới enqueue() trong lúc đang rút (chờ phản hồi AI)
  // vẫn được xử lý tiếp trong cùng lượt này. Dừng giữa chừng khi: hết tin, vượt trần ngân sách (phần
  // còn lại → onOverBudget), hoặc một lô vừa lỗi (pausedUntil) — đợi flush() lần sau mới thử lại.
  private async drain(): Promise<void> {
    while (this.items.length > 0) {
      const now = (this.deps.now ?? Date.now)()
      if (now < this.pausedUntil) return

      if (this.deps.usage.spentToday() >= this.deps.budgetUsd()) {
        for (const item of this.items.splice(0)) this.safeCall(() => this.deps.onOverBudget(item.id), 'onOverBudget')
        return
      }

      const batch = this.items.splice(0, this.deps.batchSize ?? 20)
      try {
        const { outcomes, inputTokens, outputTokens } = await this.deps.extractor.extract(batch)
        this.deps.usage.record(inputTokens, outputTokens)
        for (const outcome of outcomes) {
          this.attempts.delete(outcome.id)
          this.safeCall(() => this.deps.onOutcome(outcome), 'onOutcome')
        }
      } catch (err) {
        // Lỗi có kèm usage (đã có phản hồi từ API nhưng không dùng được) vẫn tính vào ngân sách ngày —
        // nếu không, lần gọi tốn tiền này sẽ "biến mất" khỏi spentToday() dù bị tính phí thật.
        if (err instanceof AiCallError && err.usage) {
          this.deps.usage.record(err.usage.input_tokens, err.usage.output_tokens)
        }
        this.deps.logger.error(`Gọi AI lỗi (${batch.length} tin):`, err instanceof Error ? err.message : err)
        this.pausedUntil = now + (this.deps.retryPauseMs ?? 30_000)
        for (const item of batch) {
          const tries = (this.attempts.get(item.id) ?? 0) + 1
          if (tries >= (this.deps.maxAttempts ?? 3)) {
            this.attempts.delete(item.id)
            this.safeCall(() => this.deps.onFailed(item.id), 'onFailed')
          } else {
            this.attempts.set(item.id, tries)
            this.items.push(item)
          }
        }
        return
      }
    }
  }
}
