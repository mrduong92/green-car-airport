import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConfigPoller } from '../src/remote-config.js'
import { silentLogger } from '../src/logger.js'

test('applies Laravel config and forwards QR refresh requests', async () => {
  const refresh: string[][] = []
  const poller = new ConfigPoller({
    get: async () => ({ status: 200, body: { disabled_group_ids: ['g1'], blocked_sender_uids: ['spam'], qr_refresh_uids: ['111'], ai_daily_budget_usd: 2.5 } }),
    onQrRefresh: (uids) => refresh.push(uids), fallbackBudgetUsd: 5, logger: silentLogger,
  })
  assert.equal(poller.current().aiDailyBudgetUsd, 5)
  await poller.poll()
  assert.ok(poller.current().disabledGroupIds.has('g1'))
  assert.ok(poller.current().blockedSenderUids.has('spam'))
  assert.equal(poller.current().aiDailyBudgetUsd, 2.5)
  assert.deepEqual(refresh, [['111']])
})

test('keeps the last good config when Laravel is unreachable or answers garbage', async () => {
  let answer: { status: number; body?: unknown } = { status: 200, body: { disabled_group_ids: ['g1'], blocked_sender_uids: [], qr_refresh_uids: [], ai_daily_budget_usd: 3 } }
  const poller = new ConfigPoller({ get: async () => answer, onQrRefresh: () => {}, fallbackBudgetUsd: 5, logger: silentLogger })
  await poller.poll()
  answer = { status: 0 }
  await poller.poll()
  answer = { status: 200, body: { nonsense: true } }
  await poller.poll()
  assert.ok(poller.current().disabledGroupIds.has('g1'))
  assert.equal(poller.current().aiDailyBudgetUsd, 3)
})
