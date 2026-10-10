import type { Getter } from './http.js'
import type { Logger } from './logger.js'

export interface RemoteConfig {
  disabledGroupIds: Set<string>
  blockedSenderUids: Set<string>
  aiDailyBudgetUsd: number
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

// Hỏi cấu hình Laravel (GET /api/internal/zalo/config). Lỗi mạng / câu trả lời hỏng → giữ cấu hình cũ.
export class ConfigPoller {
  private config: RemoteConfig

  constructor(
    private readonly deps: {
      get: Getter
      onQrRefresh: (uids: string[]) => void
      fallbackBudgetUsd: number
      logger: Logger
    },
  ) {
    this.config = { disabledGroupIds: new Set(), blockedSenderUids: new Set(), aiDailyBudgetUsd: deps.fallbackBudgetUsd }
  }

  current(): RemoteConfig {
    return this.config
  }

  async poll(): Promise<void> {
    const res = await this.deps.get('/api/internal/zalo/config')
    if (res.status !== 200) {
      this.deps.logger.error('Hỏi cấu hình Laravel lỗi HTTP', res.status || 'mạng')
      return
    }
    const body = res.body as Record<string, unknown> | undefined
    if (!body || !isStringArray(body.disabled_group_ids) || !isStringArray(body.blocked_sender_uids)
      || !isStringArray(body.qr_refresh_uids) || typeof body.ai_daily_budget_usd !== 'number') {
      this.deps.logger.error('Cấu hình Laravel sai định dạng, giữ cấu hình cũ')
      return
    }
    this.config = {
      disabledGroupIds: new Set(body.disabled_group_ids),
      blockedSenderUids: new Set(body.blocked_sender_uids),
      aiDailyBudgetUsd: body.ai_daily_budget_usd,
    }
    if (body.qr_refresh_uids.length > 0) this.deps.onQrRefresh(body.qr_refresh_uids)
  }
}
