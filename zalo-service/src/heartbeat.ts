import type { AccountInfo, AccountState } from './accounts.js'
import type { ServiceCounters } from './ingest.js'
import { truncate } from './text.js'

// Lỗi đăng nhập/socket đôi khi là cả stack trace — không cắt thì Laravel 422 từ chối CẢ GÓI
// heartbeat (service trông như đã chết, im lặng không cảnh báo). 300 ký tự là đủ để chẩn đoán.
const MAX_LAST_ERROR_CHARS = 300
const MAX_ZALO_NAME_CHARS = 100

/** Một nick trong heartbeat: trạng thái + (giai đoạn 5) UID, tên Zalo, lúc đăng nhập, số nhóm. */
export type HeartbeatAccount = Pick<AccountState, 'id' | 'connected' | 'loggedIn' | 'lastError'> & {
  zaloUid?: string
  zaloName?: string
  loggedInAt?: number | null
  groups?: number
}

/** Ghép snapshot của AccountManager với info() từng nick và số nhóm (group_accounts). */
export function heartbeatAccounts(
  states: Pick<AccountState, 'id' | 'connected' | 'loggedIn' | 'lastError'>[],
  info: (id: string) => Partial<AccountInfo> | undefined,
  groupCounts: Map<string, number>,
): HeartbeatAccount[] {
  return states.map((state) => ({ ...state, ...info(state.id), groups: groupCounts.get(state.id) ?? 0 }))
}

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
  accounts: HeartbeatAccount[]
  // Giai đoạn 2: hộp thư đi, hàng chờ AI, chi phí AI hôm nay, sức khoẻ lấy mã QR.
  extra?: HeartbeatExtra
}) {
  return {
    service_id: input.serviceId,
    uptime_s: Math.round((input.now - input.startedAt) / 1000),
    // Giai đoạn 4 (trang admin "Tình trạng"): gửi kèm đã đăng nhập chưa + lỗi gần nhất từng nick.
    // truncate() cắt theo code point (không theo đơn vị UTF-16) nên không bao giờ chẻ đôi emoji.
    accounts: input.accounts.map((a) => ({
      id: a.id,
      connected: a.connected,
      logged_in: a.loggedIn,
      last_error: a.lastError != null ? truncate(a.lastError, MAX_LAST_ERROR_CHARS) : null,
      // Giai đoạn 5 (tab "Nick Zalo"). Chưa biết → null (Laravel validate nullable).
      zalo_uid: a.zaloUid || null,
      zalo_name: a.zaloName ? truncate(a.zaloName, MAX_ZALO_NAME_CHARS) : null,
      logged_in_at: a.loggedInAt ?? null,
      groups: a.groups ?? 0,
    })),
    received_total: input.counters.received,
    stored_total: input.counters.stored,
    duplicates_total: input.counters.duplicates,
    skipped_non_text: input.counters.skippedNonText,
    last_message_at: input.counters.lastMessageAt,
    ...(input.extra ?? {}),
  }
}
