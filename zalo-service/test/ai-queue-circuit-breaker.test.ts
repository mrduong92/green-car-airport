import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { AiQueue, type Extractor } from '../src/ai/queue.js'
import { silentLogger } from '../src/logger.js'

// Mạch ngắt (circuit breaker): AI lỗi 3 lô liên tiếp (vd. OpenAI/Anthropic sập, key hết hạn) thì
// ngừng gọi AI 10 phút, đẩy thẳng mọi tin (đang chờ + mới vào) sang quy tắc dự phòng — tránh vừa tốn
// thời gian/tiền gọi AI biết chắc sẽ lỗi, vừa làm chậm luồng cuốc trong lúc AI đang sập.
// maxAttempts=1: mỗi tin chỉ thử 1 lần trong batch của nó rồi rơi vào onFailed nếu mạch CHƯA mở — tách
// bạch khỏi cơ chế retry-cùng-tin (đã có test riêng ở ai-queue.test.ts) để đếm đúng "3 lô liên tiếp".
function harness(extract: Extractor['extract']) {
  let t = 1_000_000
  const usage = new AiUsage(openDb(':memory:'), () => t)
  const calls: number[][] = []
  const outcomes: number[] = []
  const bypassed: number[] = []
  const failed: number[] = []
  const queue = new AiQueue({
    extractor: { extract: async (items) => { calls.push(items.map((i) => i.id)); return extract(items) } },
    usage, budgetUsd: () => 100,
    onOutcome: (o) => outcomes.push(o.id),
    onOverBudget: () => {},
    onFailed: (id) => failed.push(id),
    onBypass: (id) => bypassed.push(id),
    batchSize: 1, maxAttempts: 1, retryPauseMs: 0, logger: silentLogger, now: () => t,
  })
  return { queue, usage, calls, outcomes, bypassed, failed, advance: (ms: number) => { t += ms } }
}

const fail: Extractor['extract'] = async () => { throw new Error('lỗi AI giả lập') }
const ok: Extractor['extract'] = async (items) =>
  ({ outcomes: items.map((i) => ({ id: i.id, isRide: false, rides: [] })), inputTokens: 1, outputTokens: 1 })

test('after 3 consecutive failed batches, queued and new items bypass the extractor entirely', async () => {
  const h = harness(fail)

  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1)
  h.queue.enqueue({ id: 2, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1)
  assert.equal(h.calls.length, 2)
  assert.deepEqual(h.failed, [1, 2]) // chưa mở mạch: thua theo retry bình thường (maxAttempts=1)
  assert.deepEqual(h.bypassed, [])

  h.queue.enqueue({ id: 3, content: 'x', sentAt: 0 }) // lô lỗi thứ 3 liên tiếp → mở mạch
  await h.queue.flush()
  assert.equal(h.calls.length, 3)
  assert.deepEqual(h.bypassed, [3]) // đi thẳng fallback, KHÔNG qua onFailed
  assert.deepEqual(h.failed, [1, 2])

  // Mạch đang mở: tin mới không hề gọi extractor.
  h.queue.enqueue({ id: 4, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.equal(h.calls.length, 3)
  assert.deepEqual(h.bypassed, [3, 4])
})

test('after the 10-minute cooldown window, the extractor is called again', async () => {
  const h = harness(fail)
  for (const id of [1, 2, 3]) { h.queue.enqueue({ id, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) }
  assert.equal(h.calls.length, 3)
  assert.deepEqual(h.bypassed, [3])

  h.advance(10 * 60_000)
  h.queue.enqueue({ id: 5, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.equal(h.calls.length, 4) // thử gọi AI lại, không còn bị bỏ qua
  assert.deepEqual(h.bypassed, [3]) // id=5 không bị bypass — nó thật sự được gửi tới extractor
})

test('a successful batch resets the consecutive-failure counter', async () => {
  let succeed = false
  const h = harness(async (items) => (succeed ? ok(items) : fail(items)))

  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (1/3)
  succeed = true
  h.queue.enqueue({ id: 2, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // success → reset
  succeed = false
  h.queue.enqueue({ id: 3, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (1/3 lại)
  h.queue.enqueue({ id: 4, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (2/3)
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.bypassed, []) // chưa đủ 3 lỗi liên tiếp KỂ TỪ lần reset

  h.queue.enqueue({ id: 5, content: 'x', sentAt: 0 }); await h.queue.flush() // fail (3/3) → mở mạch
  assert.equal(h.calls.length, 5)
  assert.deepEqual(h.bypassed, [5])
})
