import type { Logger } from './logger.js'

export interface ListenerLike {
  on(event: string, cb: (...args: any[]) => void): unknown
  start(opts?: { retryOnClose?: boolean }): void
  stop(): void
}

export interface ApiLike {
  listener: ListenerLike
  getOwnId(): string
  getGroupInfo(groupId: string | string[]): Promise<{ gridInfoMap?: Record<string, { name?: string; totalMember?: number }> }>
  // zca-js: toàn bộ nhóm mà nick đang ở, kèm version (dùng để quét nhóm giai đoạn 4).
  getAllGroups(): Promise<{ gridVerMap: Record<string, string> }>
  // zca-js 2.2.0: uid → URL ảnh QR trang cá nhân (đã kiểm chứng trả cả với người chưa kết bạn).
  getQR(userId: string | string[]): Promise<Record<string, string>>
  // Chỉ để ghi log chẩn đoán nhịp ping của socket (zca-js có, fake trong test thì không).
  getContext?(): { settings?: { features?: { socket?: { ping_interval?: number; close_and_retry_codes?: number[] } } } }
}

// Zalo đóng socket "bình thường" (1000) định kỳ dù phiên vẫn còn; zca-js không tự nối lại mã này
// (không nằm trong close_and_retry_codes Zalo cấp). Phiên còn hạn → chỉ mở lại socket sau vài giây,
// không đăng nhập lại — đăng nhập lại chờ 60 giây sẽ mất tin (Zalo không cho lấy lại lịch sử nhóm).
const RECONNECT_CODES = new Set([1000])
const RECONNECT_DELAY_MS = 3_000
// Mở lại quá chừng này lần liền mà không nhận được tin nào → coi như phiên hỏng, đăng nhập lại.
const MAX_QUICK_RECONNECTS = 5

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

/** Trạng thái của MỘT lần đăng nhập: mỗi lần đăng nhập chỉ được lên lịch thử lại tối đa một lần. */
interface Attempt {
  retried: boolean
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
  private readonly reconnects = new Map<string, number>()

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

  // Các nick đang đăng nhập (để quét nhóm từng nick).
  loggedIn(): { id: string; api: ApiLike }[] {
    return [...this.apis].filter(([id]) => this.states.get(id)?.loggedIn).map(([id, api]) => ({ id, api }))
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
    const attempt: Attempt = { retried: false }
    try {
      this.setUp(account, api, state, attempt)
    } catch (err) {
      // getOwnId()/listener.start() ném lỗi: không để thành unhandled rejection làm sập cả service.
      this.failAfterLogin(account, state, attempt, err)
    }
  }

  /** Lỗi sau khi đã đăng nhập (setUp hoặc mở lại socket ném lỗi) → đăng nhập lại, qua cùng chốt một-lần. */
  private failAfterLogin(account: Account, state: AccountState, attempt: Attempt, err: unknown): void {
    state.connected = false
    state.loggedIn = false
    state.lastError = err instanceof Error ? err.message : String(err)
    if (attempt.retried) return
    attempt.retried = true
    this.deps.logger.error(`Tài khoản ${account.id}: lỗi sau đăng nhập (${state.lastError}) — thử lại sau`)
    this.retry(account)
  }

  /** Gắn listener cho một phiên vừa đăng nhập. attempt.retried = lần đăng nhập này đã lên lịch thử lại. */
  private setUp(account: Account, api: ApiLike, state: AccountState, attempt: Attempt): void {
    const log = this.deps.logger
    state.loggedIn = true
    this.apis.set(account.id, api)
    this.reconnects.set(account.id, 0)
    log.info(`Tài khoản ${account.id}: đăng nhập OK, uid ${api.getOwnId()}`)
    const socket = api.getContext?.()?.settings?.features?.socket
    if (socket) {
      log.info(`Tài khoản ${account.id}: socket ping ${socket.ping_interval}ms, mã tự nối lại [${socket.close_and_retry_codes?.join(',')}]`)
    }

    const now = this.deps.now ?? Date.now
    const stableMs = this.deps.stableMs ?? 5 * 60_000
    let connectedAt: number | undefined
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
    api.listener.on('cipher_key', () => log.info(`Tài khoản ${account.id}: đã nhận khoá giải mã, bắt đầu ping`))
    api.listener.on('closed', (code, reason) => {
      // Lần đăng nhập này đã lên lịch đăng nhập lại (hoặc đây là listener cũ) → bỏ qua, kể cả mở lại nhanh.
      if (attempt.retried) return
      state.connected = false
      checkStable()
      const quick = this.reconnects.get(account.id) ?? 0
      if (RECONNECT_CODES.has(code) && quick < MAX_QUICK_RECONNECTS) {
        // Mở lại nhanh trên phiên cũ: KHÔNG tính là lỗi, KHÔNG chiếm lượt thử lại của lần đăng nhập này.
        this.reconnects.set(account.id, quick + 1)
        log.info(`Tài khoản ${account.id}: Zalo đóng socket (${code} ${reason}) — mở lại sau ${RECONNECT_DELAY_MS / 1000}s (lần ${quick + 1})`)
        this.schedule(() => {
          if (attempt.retried) return
          try {
            api.listener.start({ retryOnClose: true })
          } catch (err) {
            this.failAfterLogin(account, state, attempt, err)
          }
        }, RECONNECT_DELAY_MS)
        return
      }
      attempt.retried = true
      state.loggedIn = false
      log.error(`Tài khoản ${account.id}: listener đóng hẳn (${code} ${reason}) — đăng nhập lại sau`)
      this.retry(account)
    })
    api.listener.on('error', (err) => log.error(`Tài khoản ${account.id}: listener lỗi`, err?.message ?? err))
    api.listener.on('message', (message) => {
      this.reconnects.set(account.id, 0)
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
  // (giữ kết nối ≥ stableMs hoặc nhận được tin), xem setUp().
  private retry(account: Account): void {
    const failures = (this.failures.get(account.id) ?? 0) + 1
    this.failures.set(account.id, failures)
    const base = this.deps.retryMs ?? 60_000
    const delay = Math.min(base * 2 ** (failures - 1), this.deps.maxRetryMs ?? 15 * 60_000)

    this.schedule(() => {
      this.start(account).catch((err) => this.deps.logger.error(`Tài khoản ${account.id}: lỗi khi đăng nhập lại`, err))
    }, delay)
  }

  private schedule(fn: () => void, ms: number): void {
    const schedule = this.deps.schedule ?? ((f: () => void, t: number) => { setTimeout(f, t) })
    schedule(fn, ms)
  }
}
