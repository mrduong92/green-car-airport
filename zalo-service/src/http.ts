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

export type Getter = (path: string) => Promise<{ status: number; body?: unknown; error?: string }>

// GET có ký (body rỗng) — dùng hỏi cấu hình Laravel. Không ném lỗi; status = 0 là lỗi mạng.
export function createGetter(opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Getter {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000

  return async (path) => {
    const { timestamp, signature } = sign(opts.secret, '')
    try {
      const res = await fetchImpl(opts.baseUrl + path, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Zalo-Timestamp': timestamp, 'X-Zalo-Signature': signature },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status !== 200) return { status: res.status }
      return { status: 200, body: await res.json() }
    } catch (err) {
      return { status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
