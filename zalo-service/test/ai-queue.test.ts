import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { AiQueue, type Extractor } from '../src/ai/queue.js'
import { silentLogger } from '../src/logger.js'

function harness(extract: Extractor['extract'], budget = 5) {
  let t = 1_000_000
  const usage = new AiUsage(openDb(':memory:'), () => t)
  const outcomes: number[] = []
  const over: number[] = []
  const failed: number[] = []
  const batches: number[][] = []
  const queue = new AiQueue({
    extractor: { extract: async (items) => { batches.push(items.map((i) => i.id)); return extract(items) } },
    usage, budgetUsd: () => budget,
    onOutcome: (o) => outcomes.push(o.id), onOverBudget: (id) => over.push(id), onFailed: (id) => failed.push(id),
    batchSize: 2, maxAttempts: 3, retryPauseMs: 100, logger: silentLogger, now: () => t,
  })
  return { queue, usage, outcomes, over, failed, batches, advance: (ms: number) => { t += ms } }
}

const ok: Extractor['extract'] = async (items) => ({ outcomes: items.map((i) => ({ id: i.id, isRide: false, rides: [] })), inputTokens: 100, outputTokens: 10 })

test('sends at most batchSize items per call and records usage', async () => {
  const h = harness(ok)
  for (const id of [1, 2, 3]) h.queue.enqueue({ id, content: 'x', sentAt: 0 })
  await h.queue.flush()
  await h.queue.flush()
  assert.deepEqual(h.batches, [[1, 2], [3]])
  assert.deepEqual(h.outcomes, [1, 2, 3])
  assert.ok(h.usage.spentToday() > 0)
})

test('over budget: items become raw rides without calling AI', async () => {
  const h = harness(ok, 0)
  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.deepEqual(h.batches, [])
  assert.deepEqual(h.over, [1])
})

test('failed batches are retried then given up', async () => {
  const h = harness(async () => { throw new Error('529 overloaded') })
  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  await h.queue.flush()
  await h.queue.flush() // còn trong thời gian tạm dừng → không gọi
  assert.equal(h.batches.length, 1)
  h.advance(100); await h.queue.flush()
  h.advance(100); await h.queue.flush()
  assert.equal(h.batches.length, 3)
  assert.deepEqual(h.failed, [1])
  assert.equal(h.queue.size, 0)
})
