import { createHmac, randomUUID } from 'node:crypto'

const API = process.env.E2E_API ?? 'http://localhost:8080'
const SECRET = process.env.E2E_ZALO_SECRET ?? 'dev-secret'

export interface SeedRide {
  pickup: string
  senderUid: string
  qrCode?: string | null
}

/** Đẩy cuốc qua đúng endpoint service Node dùng (ký HMAC như service). Trả ride_uid. */
export async function pushFreeRides(rides: SeedRide[]): Promise<string[]> {
  const now = Date.now()
  const payload = rides.map((r) => ({
    ride_uid: `e2e-${randomUUID()}`, sender_uid: r.senderUid, sender_name: `Người bắn ${r.senderUid}`, qr_code: r.qrCode ?? null,
    zalo_group_id: 'e2e-group', group_name: 'Nhóm E2E', direction: 'to_airport', pickup: r.pickup, destination: 'Sân bay Nội Bài',
    pickup_at: now + 3_600_000, pickup_time_text: 'sau 1 giờ', seats: 5, vehicle_note: null, price: 250000,
    is_free: true, is_raw: false, raw_text: `tiễn ${r.pickup} 250k`, group_count: 1, posted_at: now, expires_at: now + 2 * 3_600_000,
  }))
  const body = JSON.stringify({ rides: payload })
  const ts = String(Math.floor(now / 1000))
  const signature = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')

  const res = await fetch(`${API}/api/internal/zalo/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Zalo-Timestamp': ts, 'X-Zalo-Signature': signature },
    body,
  })
  if (res.status !== 200) throw new Error(`Đẩy cuốc E2E lỗi HTTP ${res.status}: ${await res.text()}`)
  return payload.map((p) => p.ride_uid)
}
