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

/**
 * Một tiến trình quản lý N tài khoản Zalo phụ (sơ đồ 6.4).
 * Một tài khoản lỗi (bị khoá, phiên hết hạn, listener đóng hẳn) KHÔNG làm dừng tài khoản khác;
 * tài khoản lỗi tự đăng nhập lại sau retryMs. Chỉ đọc: không gọi API ghi nào của Zalo.
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
      api = await this.deps.login(account.credentials)
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err)
      log.error(`Tài khoản ${account.id}: đăng nhập lỗi (${state.lastError}) — thử lại sau`)
      this.retry(account)
      return
    }

    state.loggedIn = true
    this.failures.set(account.id, 0)
    this.apis.set(account.id, api)
    this.reconnects.set(account.id, 0)
    log.info(`Tài khoản ${account.id}: đăng nhập OK, uid ${api.getOwnId()}`)
    const socket = api.getContext?.()?.settings?.features?.socket
    if (socket) {
      log.info(`Tài khoản ${account.id}: socket ping ${socket.ping_interval}ms, mã tự nối lại [${socket.close_and_retry_codes?.join(',')}]`)
    }

    api.listener.on('connected', () => {
      state.connected = true
      log.info(`Tài khoản ${account.id}: listener đã kết nối`)
    })
    api.listener.on('disconnected', (code, reason) => {
      state.connected = false
      log.error(`Tài khoản ${account.id}: listener ngắt (${code} ${reason}), zca-js tự kết nối lại`)
    })
    api.listener.on('cipher_key', () => log.info(`Tài khoản ${account.id}: đã nhận khoá giải mã, bắt đầu ping`))
    api.listener.on('closed', (code, reason) => {
      state.connected = false
      const quick = this.reconnects.get(account.id) ?? 0
      if (RECONNECT_CODES.has(code) && quick < MAX_QUICK_RECONNECTS) {
        this.reconnects.set(account.id, quick + 1)
        log.info(`Tài khoản ${account.id}: Zalo đóng socket (${code} ${reason}) — mở lại sau ${RECONNECT_DELAY_MS / 1000}s (lần ${quick + 1})`)
        this.schedule(() => api.listener.start({ retryOnClose: true }), RECONNECT_DELAY_MS)
        return
      }
      state.loggedIn = false
      log.error(`Tài khoản ${account.id}: listener đóng hẳn (${code} ${reason}) — đăng nhập lại sau`)
      this.retry(account)
    })
    api.listener.on('error', (err) => log.error(`Tài khoản ${account.id}: listener lỗi`, err?.message ?? err))
    api.listener.on('message', (message) => {
      this.reconnects.set(account.id, 0)
      this.deps.onMessage(account.id, message)
    })
    api.listener.start({ retryOnClose: true })
  }

  // Lùi dần 60s → 2 → 4 phút ... tối đa 15 phút: nick bị khoá mà cứ 60s đăng nhập lại (1.440 lần/ngày
  // từ cùng IP) có thể kéo các nick còn tốt bị Zalo chú ý. Đăng nhập được thì đếm lại từ đầu.
  private retry(account: Account): void {
    const failures = (this.failures.get(account.id) ?? 0) + 1
    this.failures.set(account.id, failures)
    const base = this.deps.retryMs ?? 60_000
    const delay = Math.min(base * 2 ** (failures - 1), this.deps.maxRetryMs ?? 15 * 60_000)

    this.schedule(() => { void this.start(account) }, delay)
  }

  private schedule(fn: () => void, ms: number): void {
    const schedule = this.deps.schedule ?? ((f: () => void, t: number) => { setTimeout(f, t) })
    schedule(fn, ms)
  }
}
