import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeartbeat } from '../src/heartbeat.js'
import { newCounters } from '../src/ingest.js'

test('builds the payload expected by Laravel', () => {
  const counters = { ...newCounters(), received: 10, stored: 8, duplicates: 3, ignored: 1, skippedNonText: 1, lastMessageAt: 9_000 }
  assert.deepEqual(
    buildHeartbeat({
      serviceId: 'zalo-1', startedAt: 0, now: 125_400, counters,
      accounts: [
        { id: 'acc1', connected: true, loggedIn: true },
        { id: 'acc2', connected: false, loggedIn: false, lastError: 'timeout' },
      ],
    }),
    {
      service_id: 'zalo-1', uptime_s: 125,
      accounts: [
        { id: 'acc1', connected: true, logged_in: true, last_error: null },
        { id: 'acc2', connected: false, logged_in: false, last_error: 'timeout' },
      ],
      received_total: 10, stored_total: 8, duplicates_total: 3, skipped_non_text: 1, last_message_at: 9_000,
    },
  )
})
