// Đăng nhập nick Zalo phụ bằng mã QR — dùng chung cho trang admin (account-requests.ts) và scripts/login.ts.
// Bọc Zalo.loginQR của zca-js 2.2.0 (đã đọc dist/apis/loginQR.js):
// - mỗi QR tự hết hạn sau 100 giây (setTimeout 100000 trong zca-js) → sự kiện QRCodeExpired, phải tự gọi
//   actions.retry() (tạo QR mới) hoặc actions.abort() (promise bị reject ZaloApiLoginQRAborted);
// - QRCodeDeclined (người dùng bấm từ chối trên điện thoại): có callback thì zca-js KHÔNG resolve/reject —
//   promise treo mãi nếu không abort;
// - GotLoginInfo phát ngay trước khi zca-js đăng nhập bằng cookie, data = { cookie, imei, userAgent }
//   (đúng định dạng file phiên data/accounts/<id>.json, Zalo.login(credentials) đọc lại được).
import { LoginQRCallbackEventType } from 'zca-js'

/** zca-js cho mỗi mã QR sống 100 giây. */
export const QR_LIFETIME_MS = 100_000

export class QrExpiredError extends Error {
  constructor() {
    super('Mã QR hết hạn mà chưa được quét')
    this.name = 'QrExpiredError'
  }
}

export class QrDeclinedError extends Error {
  constructor() {
    super('Đăng nhập bị từ chối trên điện thoại')
    this.name = 'QrDeclinedError'
  }
}

interface QrActions {
  retry: () => unknown
  abort: () => unknown
}

/** Sự kiện của loginQR (rút gọn từ LoginQRCallbackEvent của zca-js — chỉ phần cần dùng). */
export interface QrLoginEvent {
  type: LoginQRCallbackEventType
  data: any
  actions: QrActions | null
}

export type QrLoginFn = (onEvent: (event: QrLoginEvent) => unknown) => Promise<unknown>

export async function runQrLogin(deps: {
  loginQR: QrLoginFn
  onQr: (pngBase64: string, expiresAt: number) => Promise<void>
  maxQr?: number
  // Lưới an toàn khi zca-js treo (vd. mạng đứt giữa chừng): 3 QR × 100 giây + thời gian xác nhận.
  timeoutMs?: number
  now?: () => number
}): Promise<{ credentials: unknown }> {
  const maxQr = deps.maxQr ?? 3
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? 8 * 60_000

  let qrCount = 0
  let credentials: unknown = null
  let failure: Error | undefined
  let lastActions: QrActions | null = null
  // Gửi QR theo đúng thứ tự, và chờ gửi xong trước khi báo kết quả (qr_ready luôn đến trước done/expired).
  let sending: Promise<void> = Promise.resolve()

  const stop = (err: Error, actions: QrActions | null) => {
    failure ??= err
    try { actions?.abort() } catch { /* abort của zca-js chỉ dọn dẹp rồi reject — bỏ qua */ }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Đăng nhập QR quá thời gian (${Math.round(timeoutMs / 1000)} giây)`)
      stop(err, lastActions)
      reject(err)
    }, timeoutMs)
  })

  const run = deps.loginQR((event) => {
    if (event.actions) lastActions = event.actions
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated: {
        qrCount++
        const image = String(event.data?.image ?? '')
        const expiresAt = now() + QR_LIFETIME_MS
        sending = sending.then(() => deps.onQr(image, expiresAt)).catch(() => { /* onQr tự ghi log */ })
        break
      }
      case LoginQRCallbackEventType.QRCodeExpired:
        if (qrCount < maxQr) event.actions?.retry()
        else stop(new QrExpiredError(), event.actions)
        break
      case LoginQRCallbackEventType.QRCodeDeclined:
        stop(new QrDeclinedError(), event.actions)
        break
      case LoginQRCallbackEventType.GotLoginInfo:
        credentials = event.data
        break
    }
  })

  try {
    await Promise.race([run, timeout])
  } catch (err) {
    await sending
    throw failure ?? err
  } finally {
    clearTimeout(timer)
  }
  await sending
  if (failure) throw failure
  if (!credentials) throw new Error('Đăng nhập xong nhưng không nhận được phiên')
  return { credentials }
}
