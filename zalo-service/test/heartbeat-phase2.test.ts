import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat } from '../src/heartbeat.js'
import { newCounters } from '../src/ingest.js'

test('extra phase-2 fields are merged into the payload', () => {
  const payload = buildHeartbeat({
    serviceId: 'zalo-1', startedAt: 0, now: 1000, counters: newCounters(), accounts: [],
    extra: { outbox_backlog: 12, ai_queue_size: 3, ai_spent_today_usd: 1.5, ai_budget_usd: 5 },
  })
  assert.equal(payload.outbox_backlog, 12)
  assert.equal(payload.ai_spent_today_usd, 1.5)
  assert.equal(payload.service_id, 'zalo-1')
})
