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
      // Mạch ngắt (circuit breaker) mở: tin đi thẳng quy tắc dự phòng, không qua onFailed (xem dưới).
      // Tuỳ chọn (mặc định no-op) để các test/chỗ gọi cũ chưa quan tâm tới mạch ngắt không phải sửa.
      onBypass?: (id: number) => void
      batchSize?: number
      maxAttempts?: number
      retryPauseMs?: number
      // 4 lô gọi AI lỗi liên tiếp → mở mạch trong circuitBreakerCooldownMs (mặc định 10 phút) rồi thử lại.
      // PHẢI > maxAttempts (mặc định 3): nếu bằng nhau, một tin "độc" (luôn làm lô của chính nó lỗi) tự
      // retry đủ số lần = maxAttempts sẽ tạo ra đúng từng ấy lô lỗi liên tiếp và vô tình mở mạch — tắt
      // AI 10 phút cho MỌI tin khác dù OpenAI/Anthropic vẫn bình thường, chỉ một tin đó là có vấn đề.
      circuitBreakerThreshold?: number
      circuitBreakerCooldownMs?: number
      logger: Logger
      now?: () => number
    },
  ) {}

  // 0 = mạch đang đóng (gọi AI bình thường); > 0 = mốc thời gian mạch sẽ tự đóng lại.
  private circuitOpenUntil = 0
  private consecutiveFailedBatches = 0

  get size(): number {
    return this.items.length
  }

  // Mạch đang mở? Tự đóng lại (và log đúng 1 lần) ngay khi phát hiện đã hết thời gian chờ, thay vì
  // chờ tới lượt flush() kế tiếp mới nhận ra — enqueue() gọi hàm này nên việc tự đóng xảy ra ngay cả
  // khi không có flush() nào chạy trong lúc chờ.
  private circuitOpen(now: number): boolean {
    if (this.circuitOpenUntil === 0) return false
    if (now < this.circuitOpenUntil) return true

    this.circuitOpenUntil = 0
    this.consecutiveFailedBatches = 0
    this.deps.logger.error('Mạch ngắt AI: đóng lại sau thời gian chờ, thử gọi AI bình thường trở lại.')
    return false
  }

  private tripCircuit(now: number): void {
    const cooldownMs = this.deps.circuitBreakerCooldownMs ?? 10 * 60_000
    this.circuitOpenUntil = now + cooldownMs
    this.deps.logger.error(
      `Mạch ngắt AI: mở sau ${this.consecutiveFailedBatches} lô lỗi liên tiếp — tạm chuyển toàn bộ ` +
      `tin sang quy tắc dự phòng trong ${Math.round(cooldownMs / 60_000)} phút rồi mới thử gọi AI lại.`,
    )
  }

  enqueue(item: AiItem): void {
    if (this.circuitOpen((this.deps.now ?? Date.now)())) {
      this.safeCall(() => this.deps.onBypass?.(item.id), 'onBypass')
      return
    }

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

      // Mạch đang mở (4 lô lỗi liên tiếp trước đó): không gọi AI nữa, đẩy thẳng mọi tin đang chờ
      // sang fallback cho tới khi mạch tự đóng lại.
      if (this.circuitOpen(now)) {
        for (const item of this.items.splice(0)) {
          this.attempts.delete(item.id)
          this.safeCall(() => this.deps.onBypass?.(item.id), 'onBypass')
        }
        return
      }

      if (now < this.pausedUntil) return

      if (this.deps.usage.spentToday() >= this.deps.budgetUsd()) {
        for (const item of this.items.splice(0)) this.safeCall(() => this.deps.onOverBudget(item.id), 'onOverBudget')
        return
      }

      const batch = this.items.splice(0, this.deps.batchSize ?? 20)
      try {
        const { outcomes, inputTokens, outputTokens } = await this.deps.extractor.extract(batch)
        this.deps.usage.record(inputTokens, outputTokens)
        this.consecutiveFailedBatches = 0
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
        this.consecutiveFailedBatches++

        // Đủ số lô lỗi liên tiếp (mặc định 4, > maxAttempts mặc định 3 — xem giải thích ở constructor) và
        // mạch chưa mở → mở mạch ngay, đẩy thẳng CẢ lô vừa lỗi lẫn phần còn lại trong hàng đợi sang
        // fallback — không đi qua onFailed/retry từng tin nữa, vì lúc này nghi AI đang sập toàn bộ chứ
        // không phải một tin khó.
        if (this.circuitOpenUntil === 0 && this.consecutiveFailedBatches >= (this.deps.circuitBreakerThreshold ?? 4)) {
          this.tripCircuit(now)
          for (const item of [...batch, ...this.items.splice(0)]) {
            this.attempts.delete(item.id)
            this.safeCall(() => this.deps.onBypass?.(item.id), 'onBypass')
          }
          return
        }

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
