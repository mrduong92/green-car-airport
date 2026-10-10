import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat, collectHeartbeatExtra } from '../src/heartbeat.js'
import { newCounters } from '../src/ingest.js'

test('extra phase-2 fields are merged into the payload', () => {
  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(), accounts: [],
    extra: { outbox_backlog: 12, ai_queue_size: 3, ai_spent_today_usd: 1.5, ai_budget_usd: 5, qr_queue_size: 0, held_back_rides: 0, qr_ok_24h: 0, qr_empty_24h: 0, qr_error_24h: 0 },
  })
  assert.equal(payload.outbox_backlog, 12)
  assert.equal(payload.ai_spent_today_usd, 1.5)
  assert.equal(payload.service_id, 'zalo-1')
})

test('collectHeartbeatExtra reports QR health and held-back rides', () => {
  const extra = collectHeartbeatExtra({
    now: 100 * 3_600_000,
    rides: { backlog: () => 7, heldBack: () => 4 },
    senders: { qrStats: (since: number) => { assert.equal(since, 76 * 3_600_000); return { ok: 9, empty: 2, error: 1 } } },
    qr: { size: 5 },
    ai: { size: 3 },
    usage: { spentToday: () => 1.25 },
    budgetUsd: 5,
  })
  assert.deepEqual(extra, {
    outbox_backlog: 7, ai_queue_size: 3, ai_spent_today_usd: 1.25, ai_budget_usd: 5,
    qr_queue_size: 5, held_back_rides: 4, qr_ok_24h: 9, qr_empty_24h: 2, qr_error_24h: 1,
  })
  assert.equal(collectHeartbeatExtra({ now: 0, rides: { backlog: () => 0, heldBack: () => 0 }, senders: { qrStats: () => ({ ok: 0, empty: 0, error: 0 }) }, qr: { size: 0 }, ai: null, usage: { spentToday: () => 0 }, budgetUsd: 5 }).ai_queue_size, 0)
})
