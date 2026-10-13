import { createHmac, randomUUID } from 'node:crypto'

const API = process.env.E2E_API ?? 'http://localhost:8080'
const SECRET = process.env.E2E_ZALO_SECRET ?? 'dev-secret'

export interface SeedRide {
  pickup: string
  senderUid: string
  qrCode?: string | null
  /** Mặc định 'e2e-group' — truyền riêng khi test cần một nhóm Zalo Group ID độc lập (vd. bật/tắt ở admin). */
  zaloGroupId?: string
  /** Mặc định 'Nhóm E2E'. */
  groupName?: string
}

function signedHeaders(ts: string, body: string): Record<string, string> {
  const signature = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
  return { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Zalo-Timestamp': ts, 'X-Zalo-Signature': signature }
}

/** Đẩy cuốc qua đúng endpoint service Node dùng (ký HMAC như service). Trả ride_uid. */
export async function pushFreeRides(rides: SeedRide[]): Promise<string[]> {
  const now = Date.now()
  const payload = rides.map((r) => ({
    ride_uid: `e2e-${randomUUID()}`, sender_uid: r.senderUid, sender_name: `Người bắn ${r.senderUid}`, qr_code: r.qrCode ?? null,
    zalo_group_id: r.zaloGroupId ?? 'e2e-group', group_name: r.groupName ?? 'Nhóm E2E', direction: 'to_airport', pickup: r.pickup, destination: 'Sân bay Nội Bài',
    pickup_at: now + 3_600_000, pickup_time_text: 'sau 1 giờ', seats: 5, vehicle_note: null, price: 250000,
    is_free: true, is_raw: false, raw_text: `tiễn ${r.pickup} 250k`, group_count: 1, posted_at: now, expires_at: now + 2 * 3_600_000,
  }))
  const body = JSON.stringify({ rides: payload })
  const ts = String(Math.floor(now / 1000))

  const res = await fetch(`${API}/api/internal/zalo/rides`, {
    method: 'POST',
    headers: signedHeaders(ts, body),
    body,
  })
  if (res.status !== 200) throw new Error(`Đẩy cuốc E2E lỗi HTTP ${res.status}: ${await res.text()}`)
  return payload.map((p) => p.ride_uid)
}

export interface SeedGroup {
  zaloGroupId: string
  name: string
  messages24h?: number
}

/**
 * Đăng ký/đồng bộ nhóm Zalo qua đúng endpoint service Node dùng (ký HMAC như service), để nhóm
 * xuất hiện ở tab "Nhóm Zalo" của trang admin Cuốc Free. `pushFreeRides` KHÔNG tạo hàng
 * `zalo_groups` — nó chỉ ghi `zalo_group_id` dạng text vào `free_rides` — nên test nào cần bật/tắt
 * một nhóm ở admin phải gọi hàm này trước, với `zaloGroupId` trùng với cuốc đã đẩy.
 */
export async function pushZaloGroups(groups: SeedGroup[]): Promise<void> {
  const now = Date.now()
  const payload = groups.map((g) => ({
    zalo_group_id: g.zaloGroupId, name: g.name, last_message_at: now, messages_24h: g.messages24h ?? 1,
  }))
  const body = JSON.stringify({ groups: payload })
  const ts = String(Math.floor(now / 1000))

  const res = await fetch(`${API}/api/internal/zalo/groups`, {
    method: 'POST',
    headers: signedHeaders(ts, body),
    body,
  })
  if (res.status !== 200) throw new Error(`Đẩy nhóm E2E lỗi HTTP ${res.status}: ${await res.text()}`)
}
