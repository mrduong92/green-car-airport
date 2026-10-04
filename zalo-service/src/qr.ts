import { Jimp } from 'jimp'
import jsQRModule from 'jsqr'
import type { Logger } from './logger.js'
import type { SenderStore } from './senders.js'

// jsqr là CommonJS mà d.ts khai "export default": với NodeNext, TS coi import mặc định là cả module (không gọi được),
// còn lúc chạy nó là hàm và có thêm thuộc tính .default trỏ chính hàm đó → lấy .default nếu có.
const jsQR = ((jsQRModule as unknown as { default?: unknown }).default ?? jsQRModule) as typeof jsQRModule.default

// "http://zaloapp.com/qr/p/758z6tl22yft" → "758z6tl22yft"
export function extractQrCode(text: string | null): string | null {
  const m = text?.match(/qr\/p\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

// Tải ảnh QR (URL do getQR trả) và giải mã ra chuỗi link. Không đọc được → null.
export async function decodeQrFromUrl(url: string): Promise<string | null> {
  const image = await Jimp.read(url)
  const code = jsQR(new Uint8ClampedArray(image.bitmap.data), image.bitmap.width, image.bitmap.height)
  return code?.data ?? null
}

/**
 * Hàng đợi lấy mã deeplink người gửi — mỗi step() xử lý MỘT người; index.ts gọi step() mỗi qrIntervalMs
 * (≥ 2 giây) để không dồn lời gọi lên Zalo. Chỉ lưu đoạn mã; ảnh dùng tạm rồi bỏ.
 * Hết hạn: mã 'ok'/'empty' làm mới sau refreshMs (7 ngày); 'error' thử lại sau errorRetryMs (1 giờ).
 */
export class QrQueue {
  private readonly queue: string[] = []
  private readonly queued = new Set<string>()

  constructor(
    private readonly deps: {
      senders: SenderStore
      getQr: (uid: string) => Promise<Record<string, string>>
      decode: (imageUrl: string) => Promise<string | null>
      refreshMs: number
      errorRetryMs?: number
      logger: Logger
      now?: () => number
    },
  ) {}

  get size(): number {
    return this.queue.length
  }

  ensure(uid: string): void {
    const info = this.deps.senders.qr(uid)
    const now = (this.deps.now ?? Date.now)()
    const age = info.fetchedAt === null ? Infinity : now - info.fetchedAt
    const due = info.status === 'error' ? age > (this.deps.errorRetryMs ?? 3_600_000) : age > this.deps.refreshMs
    if (due && !this.queued.has(uid)) {
      this.queued.add(uid)
      this.queue.push(uid)
    }
  }

  async step(): Promise<void> {
    const uid = this.queue.shift()
    if (uid === undefined) return
    this.queued.delete(uid)
    const now = (this.deps.now ?? Date.now)()

    try {
      const url = (await this.deps.getQr(uid))[uid]
      const code = url ? extractQrCode(await this.deps.decode(url)) : null
      this.deps.senders.saveQr(uid, code, code ? 'ok' : 'empty', now)
      this.deps.logger.info(code ? `Đã lấy mã deeplink của ${uid}: ${code}` : `Người gửi ${uid} không chia sẻ mã QR`)
    } catch (err) {
      this.deps.logger.error(`Lấy mã QR ${uid} lỗi:`, err instanceof Error ? err.message : err)
      this.deps.senders.saveQr(uid, null, 'error', now)
    }
  }
}
