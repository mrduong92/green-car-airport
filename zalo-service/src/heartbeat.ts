import type { ServiceCounters } from './ingest.js'

export interface HeartbeatExtra {
  outbox_backlog: number
  ai_queue_size: number
  ai_spent_today_usd: number
  ai_budget_usd: number
  qr_queue_size: number
  held_back_rides: number
  qr_ok_24h: number
  qr_empty_24h: number
  qr_error_24h: number
}

// Số liệu giai đoạn 2 cho heartbeat. Hỏng giải mã QR là hỏng ÂM THẦM (mọi người bắn thành 'empty', cuốc bị
// giữ lại mãi) → báo tỷ lệ ok/empty/error 24 giờ và số cuốc bị giữ để Laravel cảnh báo.
export function collectHeartbeatExtra(input: {
  now: number
  rides: { backlog(): number; heldBack(): number }
  senders: { qrStats(since: number): { ok: number; empty: number; error: number } }
  qr: { size: number }
  ai: { size: number } | null
  usage: { spentToday(): number }
  budgetUsd: number
}): HeartbeatExtra {
  const qr = input.senders.qrStats(input.now - 24 * 3_600_000)
  return {
    outbox_backlog: input.rides.backlog(),
    ai_queue_size: input.ai?.size ?? 0,
    ai_spent_today_usd: input.usage.spentToday(),
    ai_budget_usd: input.budgetUsd,
    qr_queue_size: input.qr.size,
    held_back_rides: input.rides.heldBack(),
    qr_ok_24h: qr.ok,
    qr_empty_24h: qr.empty,
    qr_error_24h: qr.error,
  }
}

// Payload khớp validate của ZaloServiceController::heartbeat (Laravel).
export function buildHeartbeat(input: {
  serviceId: string
  startedAt: number
  now: number
  counters: ServiceCounters
  accounts: { id: string; connected: boolean }[]
  // Giai đoạn 2: hộp thư đi, hàng chờ AI, chi phí AI hôm nay, sức khoẻ lấy mã QR.
  extra?: HeartbeatExtra
}) {
  return {
    service_id: input.serviceId,
    uptime_s: Math.round((input.now - input.startedAt) / 1000),
    accounts: input.accounts.map((a) => ({ id: a.id, connected: a.connected })),
    received_total: input.counters.received,
    stored_total: input.counters.stored,
    duplicates_total: input.counters.duplicates,
    skipped_non_text: input.counters.skippedNonText,
    last_message_at: input.counters.lastMessageAt,
    ...(input.extra ?? {}),
  }
}
