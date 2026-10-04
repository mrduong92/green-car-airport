import type { ServiceCounters } from './ingest.js'

// Payload khớp validate của ZaloServiceController::heartbeat (Laravel).
export function buildHeartbeat(input: {
  serviceId: string
  startedAt: number
  now: number
  counters: ServiceCounters
  accounts: { id: string; connected: boolean }[]
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
  }
}
