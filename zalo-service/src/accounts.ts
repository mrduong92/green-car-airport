import type { Logger } from './logger.js'

export interface ListenerLike {
  on(event: string, cb: (...args: any[]) => void): unknown
  start(opts?: { retryOnClose?: boolean }): void
  stop(): void
}

export interface ApiLike {
  listener: ListenerLike
  getOwnId(): string
  getGroupInfo(groupId: string): Promise<{ gridInfoMap?: Record<string, { name?: string }> }>
}

export interface Account {
  id: string
  credentials: unknown
}

export interface AccountState {
  id: string
  loggedIn: boolean
  connected: boolean
  lastError?: string
}

/**
 * Một tiến trình quản lý N tài khoản Zalo phụ (sơ đồ 6.4).
 * Một tài khoản lỗi (bị khoá, phiên hết hạn, listener đóng hẳn, đăng nhập treo) KHÔNG làm dừng
 * tài khoản khác; tài khoản lỗi tự đăng nhập lại, lùi dần từ retryMs. Chỉ đọc: không gọi API ghi nào của Zalo.
 */
export class AccountManager {
  private readonly states = new Map<string, AccountState>()
  private readonly apis = new Map<string, ApiLike>()
  private readonly failures = new Map<string, number>()

  constructor(
    private readonly deps: {
      accounts: Account[]
      login: (credentials: unknown) => Promise<ApiLike>
      onMessage: (accountId: string, message: unknown) => void
      logger: Logger
      retryMs?: number
      maxRetryMs?: number
      schedule?: (fn: () => void, ms: number) => void
      // Phiên giữ kết nối liên tục chừng này (hoặc đã nhận được tin) mới coi là khoẻ → đếm lỗi lại từ đầu.
      stableMs?: number
      // zca-js có thể treo khi mạng chập chờn; quá hạn thì tính là đăng nhập lỗi.
      loginTimeoutMs?: number
      now?: () => number
    },
  ) {}

  async startAll(): Promise<void> {
    await Promise.all(this.deps.accounts.map((account) => this.start(account)))
  }

  snapshot(): AccountState[] {
    return [...this.states.values()].map((state) => ({ ...state }))
  }

  anyApi(): ApiLike | undefined {
    for (const [id, api] of this.apis) {
      if (this.states.get(id)?.loggedIn) return api
    }
    return undefined
  }

  stopAll(): void {
    for (const api of this.apis.values()) api.listener.stop()
  }

  private async start(account: Account): Promise<void> {
    const state: AccountState = { id: account.id, loggedIn: false, connected: false }
    this.states.set(account.id, state)
    const log = this.deps.logger

    let api: ApiLike
    try {
      api = await this.loginWithTimeout(account)
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      log.error(`Tài khoản ${account.id}: đăng nhập lỗi (${state.lastError}) — thử lại sau`)
      this.retry(account)
      return
    }

    // KHÔNG đếm lại lỗi ngay khi đăng nhập được: phiên bị đá/khoá có thể đăng nhập OK rồi listener
    // đóng ngay, nếu reset ở đây thì vòng đăng nhập → đóng → thử lại mãi ở mức 60s, không bao giờ lùi.
    state.loggedIn = true
    this.apis.set(account.id, api)
    log.info(`Tài khoản ${account.id}: đăng nhập OK, uid ${api.getOwnId()}`)

    const now = this.deps.now ?? Date.now
    const stableMs = this.deps.stableMs ?? 5 * 60_000
    let connectedAt: number | undefined
    let retried = false // mỗi lần đăng nhập chỉ lên lịch thử lại tối đa một lần
    const markHealthy = () => { this.failures.set(account.id, 0) }
    const checkStable = () => {
      if (connectedAt !== undefined && now() - connectedAt >= stableMs) markHealthy()
      connectedAt = undefined
    }

    api.listener.on('connected', () => {
      state.connected = true
      connectedAt = now()
      log.info(`Tài khoản ${account.id}: listener đã kết nối`)
    })
    api.listener.on('disconnected', (code, reason) => {
      state.connected = false
      checkStable()
      log.error(`Tài khoản ${account.id}: listener ngắt (${code} ${reason}), zca-js tự kết nối lại`)
    })
    api.listener.on('closed', (code, reason) => {
      if (retried) return
      retried = true
      state.connected = false
      state.loggedIn = false
      checkStable()
      log.error(`Tài khoản ${account.id}: listener đóng hẳn (${code} ${reason}) — đăng nhập lại sau`)
      this.retry(account)
    })
    api.listener.on('error', (err) => log.error(`Tài khoản ${account.id}: listener lỗi`, err?.message ?? err))
    api.listener.on('message', (message) => {
      markHealthy()
      this.deps.onMessage(account.id, message)
    })
    api.listener.start({ retryOnClose: true })
  }

  private async loginWithTimeout(account: Account): Promise<ApiLike> {
    const ms = this.deps.loginTimeoutMs ?? 60_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`đăng nhập quá thời gian (${ms}ms), có thể mạng treo`)), ms)
    })
    try {
      return await Promise.race([this.deps.login(account.credentials), timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  // Lùi dần 60s → 2 → 4 phút ... tối đa 15 phút: nick bị khoá mà cứ 60s đăng nhập lại (1.440 lần/ngày
  // từ cùng IP) có thể kéo các nick còn tốt bị Zalo chú ý. Chỉ đếm lại từ đầu khi phiên đã khoẻ
  // (giữ kết nối ≥ stableMs hoặc nhận được tin), xem start().
  private retry(account: Account): void {
    const failures = (this.failures.get(account.id) ?? 0) + 1
    this.failures.set(account.id, failures)
    const base = this.deps.retryMs ?? 60_000
    const delay = Math.min(base * 2 ** (failures - 1), this.deps.maxRetryMs ?? 15 * 60_000)

    const schedule = this.deps.schedule ?? ((fn: () => void, ms: number) => { setTimeout(fn, ms) })
    schedule(() => { void this.start(account) }, delay)
  }
}
