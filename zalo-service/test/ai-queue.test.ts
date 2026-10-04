import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { AiQueue, AiCallError, type AiOutcome, type Extractor } from '../src/ai/queue.js'
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

test('a failed call that still returned a response bills its usage before retrying', async () => {
  const h = harness(async () => { throw new AiCallError('AI không trả kết quả hợp lệ', { input_tokens: 500, output_tokens: 50 }) })
  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.deepEqual(h.batches, [[1]])
  assert.ok(h.usage.spentToday() > 0) // bị tính phí dù lần gọi thất bại
  assert.equal(h.queue.size, 1) // vẫn được thử lại như trước
  assert.deepEqual(h.failed, [])
})

test('a callback that throws does not get mistaken for a failed AI call', async () => {
  let t = 1_000_000
  const usage = new AiUsage(openDb(':memory:'), () => t)
  const batches: number[][] = []
  const delivered: number[] = []
  const failed: number[] = []
  const queue = new AiQueue({
    extractor: { extract: async (items) => { batches.push(items.map((i) => i.id)); return ok(items) } },
    usage, budgetUsd: () => 5,
    onOutcome: (o: AiOutcome) => {
      if (o.id === 1) throw new Error('lỗi trong callback, không liên quan tới AI')
      delivered.push(o.id)
    },
    onOverBudget: () => {}, onFailed: (id) => failed.push(id),
    batchSize: 2, maxAttempts: 3, retryPauseMs: 100, logger: silentLogger, now: () => t,
  })
  queue.enqueue({ id: 1, content: 'x', sentAt: 0 })
  queue.enqueue({ id: 2, content: 'x', sentAt: 0 })
  await queue.flush()
  await queue.flush() // hàng chờ đã rỗng → không gọi AI lại dù callback vừa ném lỗi

  assert.equal(batches.length, 1) // AI chỉ được gọi một lần cho lô này
  assert.deepEqual(delivered, [2]) // outcome còn lại vẫn được giao bình thường
  assert.deepEqual(failed, [])
  assert.equal(queue.size, 0) // không bị đẩy lại hàng chờ để "thử lại"
})
