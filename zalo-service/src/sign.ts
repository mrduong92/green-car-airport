import { createHmac } from 'node:crypto'

// Khớp VerifyZaloBotSignature (Laravel): hex HMAC-SHA256(secret, `${timestamp}.${body}`).
// Ký trên CHÍNH chuỗi body sẽ gửi đi — không stringify lại lần nữa.
export function sign(secret: string, body: string, nowMs: number = Date.now()): { timestamp: string; signature: string } {
  const timestamp = String(Math.floor(nowMs / 1000))
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return { timestamp, signature }
}
