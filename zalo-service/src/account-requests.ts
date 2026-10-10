// Đăng nhập / gỡ nick Zalo phụ theo yêu cầu từ trang admin (giai đoạn 5, spec mục 2).
// Laravel KHÔNG gọi vào service: service hỏi GET /api/internal/zalo/account-requests (có ký) mỗi 5 giây,
// báo tiến độ bằng POST .../account-requests/{id}. Phiên đăng nhập (cookie/imei) chỉ ghi ra đĩa VPS —
// thứ duy nhất gửi sang Laravel là ảnh QR + UID/tên Zalo.
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Account, AccountInfo } from './accounts.js'
import type { Getter, Sender } from './http.js'
import type { Logger } from './logger.js'
import { truncate } from './text.js'
import { QrExpiredError } from './zalo-login.js'

export const ACCOUNT_ID_PATTERN = /^[a-z0-9-]{1,32}$/
const REQUESTS_PATH = '/api/internal/zalo/account-requests'
const MAX_ERROR_CHARS = 300

export interface AccountRequest {
  id: number | string
  type: 'login' | 'remove'
  account_id: string
}

export type QrLogin = (onQr: (pngBase64: string, expiresAt: number) => Promise<void>) => Promise<{ credentials: unknown }>

// id đi vào đường dẫn POST → chỉ nhận số nguyên hoặc chuỗi an toàn (số / uuid).
const isRequest = (v: unknown): v is AccountRequest => {
  const r = v as Record<string, unknown> | null
  return !!r && (Number.isInteger(r.id) || (typeof r.id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(r.id)))
    && (r.type === 'login' || r.type === 'remove') && typeof r.account_id === 'string'
}

export class AccountRequestsPoller {
  private busy = false

  constructor(
    private readonly deps: {
      get: Getter
      post: Sender
      manager: {
        add(account: Account): Promise<void>
        remove(id: string): void
        info(id: string): Partial<AccountInfo> | undefined
      }
      accountsDir: string
      // runQrLogin đã gắn sẵn new Zalo().loginQR (index.ts); test truyền bản giả.
      login: QrLogin
      logger: Logger
      now?: () => number
      onAdded?: (id: string) => void
      onRemoved?: (id: string) => void
    },
  ) {}

  /** Mỗi lần xử lý MỘT yêu cầu; đang đăng nhập (chờ quét QR, có thể vài phút) thì các lượt poll khác bỏ qua. Không ném lỗi. */
  async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const res = await this.deps.get(REQUESTS_PATH)
      if (res.status !== 200) {
        this.deps.logger.error('Hỏi yêu cầu đăng nhập/gỡ nick lỗi HTTP', res.status || 'mạng')
        return
      }
      const list = (res.body as { requests?: unknown } | undefined)?.requests
      if (!Array.isArray(list)) {
        this.deps.logger.error('Danh sách yêu cầu nick sai định dạng')
        return
      }
      const request = list.find(isRequest)
      if (request) await this.handle(request)
    } catch (err) {
      this.deps.logger.error('Xử lý yêu cầu nick lỗi:', err instanceof Error ? err.message : err)
    } finally {
      this.busy = false
    }
  }

  private async handle(request: AccountRequest): Promise<void> {
    if (!ACCOUNT_ID_PATTERN.test(request.account_id)) {
      await this.report(request, { status: 'failed', error: 'Tên nick không hợp lệ' })
      return
    }
    if (request.type === 'remove') await this.remove(request)
    else await this.login(request)
  }

  private async login(request: AccountRequest): Promise<void> {
    const id = request.account_id
    const log = this.deps.logger
    log.info(`Nick ${id}: bắt đầu đăng nhập QR theo yêu cầu #${request.id}`)

    let credentials: unknown
    try {
      ({ credentials } = await this.deps.login(async (qrImage, qrExpiresAt) => {
        await this.report(request, { status: 'qr_ready', qr_image: qrImage, qr_expires_at: qrExpiresAt })
      }))
    } catch (err) {
      if (err instanceof QrExpiredError) {
        log.info(`Nick ${id}: hết lượt mã QR mà chưa đăng nhập xong (chưa quét, hoặc mã hết hạn khi điện thoại đang xác nhận) — admin cần thử lại`)
        await this.report(request, { status: 'expired', error: err.message })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        log.error(`Nick ${id}: đăng nhập QR lỗi (${message})`)
        await this.report(request, { status: 'failed', error: truncate(message, MAX_ERROR_CHARS) })
      }
      return
    }

    try {
      this.saveSession(id, credentials)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`Nick ${id}: ghi file phiên lỗi (${message})`)
      await this.report(request, { status: 'failed', error: truncate(`Không ghi được file phiên: ${message}`, MAX_ERROR_CHARS) })
      return
    }

    // add() tự thay phiên cũ nếu id đã chạy (đăng nhập lại), không restart service.
    await this.deps.manager.add({ id, credentials })
    const info = this.deps.manager.info(id)
    if (!info?.zaloUid) {
      log.error(`Nick ${id}: đã lưu phiên nhưng chưa đăng nhập được — service sẽ tự thử lại`)
      await this.report(request, { status: 'failed', error: `Đã lưu phiên nick ${id} nhưng đăng nhập lỗi — service sẽ tự thử lại` })
      return
    }
    log.info(`Nick ${id}: đã đăng nhập ${info.zaloName || ''} (uid ${info.zaloUid})`)
    this.deps.onAdded?.(id)
    await this.report(request, { status: 'done', zalo_uid: info.zaloUid, zalo_name: info.zaloName ?? '' })
  }

  private async remove(request: AccountRequest): Promise<void> {
    const id = request.account_id
    this.deps.manager.remove(id)
    const file = join(this.deps.accountsDir, `${id}.json`)
    // Không xoá hẳn — phòng gỡ nhầm; loadAccounts chỉ nạp *.json nên file đổi tên không chạy lại.
    if (existsSync(file)) renameSync(file, `${file}.removed-${(this.deps.now ?? Date.now)()}`)
    this.deps.onRemoved?.(id)
    this.deps.logger.info(`Nick ${id}: đã gỡ theo yêu cầu #${request.id}`)
    await this.report(request, { status: 'done' })
  }

  /** Ghi file tạm 0600 rồi đổi tên: không bao giờ để lại file phiên ghi dở hay quyền rộng. */
  private saveSession(id: string, credentials: unknown): void {
    mkdirSync(this.deps.accountsDir, { recursive: true })
    const file = join(this.deps.accountsDir, `${id}.json`)
    const tmp = `${file}.tmp`
    rmSync(tmp, { force: true })
    writeFileSync(tmp, JSON.stringify(credentials), { mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, file)
  }

  private async report(request: AccountRequest, payload: Record<string, unknown>): Promise<void> {
    const res = await this.deps.post(`${REQUESTS_PATH}/${request.id}`, payload)
    if (res.status !== 200) {
      this.deps.logger.error(`Báo trạng thái ${String(payload.status)} cho yêu cầu nick #${request.id} lỗi HTTP`, res.status || 'mạng')
    }
  }
}
