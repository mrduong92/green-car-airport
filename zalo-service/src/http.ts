import { sign } from './sign.js'

export type Sender = (path: string, payload: unknown) => Promise<{ status: number; error?: string }>

// Trả { status } thay vì ném lỗi; status = 0 nghĩa là lỗi mạng / timeout.
export function createSender(opts: {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Sender {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000

  return async (path, payload) => {
    const body = JSON.stringify(payload)
    const { timestamp, signature } = sign(opts.secret, body)

    try {
      const res = await fetchImpl(opts.baseUrl + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Zalo-Timestamp': timestamp,
          'X-Zalo-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      return { status: res.status }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
