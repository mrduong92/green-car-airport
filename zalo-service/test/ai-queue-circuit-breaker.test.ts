import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { AiQueue, type Extractor } from '../src/ai/queue.js'
import { silentLogger } from '../src/logger.js'

// Mạch ngắt (circuit breaker): AI lỗi 4 lô liên tiếp (vd. OpenAI/Anthropic sập, key hết hạn) thì
// ngừng gọi AI 10 phút, đẩy thẳng mọi tin (đang chờ + mới vào) sang quy tắc dự phòng — tránh vừa tốn
// thời gian/tiền gọi AI biết chắc sẽ lỗi, vừa làm chậm luồng cuốc trong lúc AI đang sập.
// maxAttempts=1: mỗi tin chỉ thử 1 lần trong batch của nó rồi rơi vào onFailed nếu mạch CHƯA mở — tách
// bạch khỏi cơ chế retry-cùng-tin (đã có test riêng ở ai-queue.test.ts) để đếm đúng "4 lô liên tiếp".
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

test('after 4 consecutive failed batches, queued and new items bypass the extractor entirely', async () => {
  const h = harness(fail)

  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1)
  h.queue.enqueue({ id: 2, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1)
  h.queue.enqueue({ id: 3, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1)
  assert.equal(h.calls.length, 3)
  assert.deepEqual(h.failed, [1, 2, 3]) // chưa mở mạch: thua theo retry bình thường (maxAttempts=1)
  assert.deepEqual(h.bypassed, [])

  h.queue.enqueue({ id: 4, content: 'x', sentAt: 0 }) // lô lỗi thứ 4 liên tiếp → mở mạch
  await h.queue.flush()
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.bypassed, [4]) // đi thẳng fallback, KHÔNG qua onFailed
  assert.deepEqual(h.failed, [1, 2, 3])

  // Mạch đang mở: tin mới không hề gọi extractor.
  h.queue.enqueue({ id: 5, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.bypassed, [4, 5])
})

test('after the 10-minute cooldown window, the extractor is called again', async () => {
  const h = harness(fail)
  for (const id of [1, 2, 3, 4]) { h.queue.enqueue({ id, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) }
  assert.equal(h.calls.length, 4)
  assert.deepEqual(h.bypassed, [4])

  h.advance(10 * 60_000)
  h.queue.enqueue({ id: 5, content: 'x', sentAt: 0 })
  await h.queue.flush()
  assert.equal(h.calls.length, 5) // thử gọi AI lại, không còn bị bỏ qua
  assert.deepEqual(h.bypassed, [4]) // id=5 không bị bypass — nó thật sự được gửi tới extractor
})

test('a successful batch resets the consecutive-failure counter', async () => {
  let succeed = false
  const h = harness(async (items) => (succeed ? ok(items) : fail(items)))

  h.queue.enqueue({ id: 1, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (1/4)
  succeed = true
  h.queue.enqueue({ id: 2, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // success → reset
  succeed = false
  h.queue.enqueue({ id: 3, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (1/4 lại)
  h.queue.enqueue({ id: 4, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (2/4)
  h.queue.enqueue({ id: 5, content: 'x', sentAt: 0 }); await h.queue.flush(); h.advance(1) // fail (3/4)
  assert.equal(h.calls.length, 5)
  assert.deepEqual(h.bypassed, []) // chưa đủ 4 lỗi liên tiếp KỂ TỪ lần reset

  h.queue.enqueue({ id: 6, content: 'x', sentAt: 0 }); await h.queue.flush() // fail (4/4) → mở mạch
  assert.equal(h.calls.length, 6)
  assert.deepEqual(h.bypassed, [6])
})

// Ngưỡng mạch ngắt (circuitBreakerThreshold, mặc định 4) phải LỚN HƠN maxAttempts mỗi tin (mặc định 3):
// nếu bằng nhau, một tin "độc" (luôn làm lô của chính nó lỗi) tự nó tạo đủ 3 lô lỗi liên tiếp khi bị
// thử lại — mở nhầm mạch ngắt và tắt AI 10 phút cho MỌI tin khác dù AI (OpenAI/Anthropic) vẫn bình thường.
test('a poison item failing 3 times in a row does not trip the breaker — the next batch still calls the extractor', async () => {
  let t = 1_000_000
  const usage = new AiUsage(openDb(':memory:'), () => t)
  const calls: number[][] = []
  const outcomes: number[] = []
  const bypassed: number[] = []
  const failed: number[] = []
  const queue = new AiQueue({
    extractor: {
      extract: async (items) => {
        calls.push(items.map((i) => i.id))
        if (items.some((i) => i.id === 1)) throw new Error('tin độc lúc nào cũng làm lô lỗi')
        return { outcomes: items.map((i) => ({ id: i.id, isRide: false, rides: [] })), inputTokens: 1, outputTokens: 1 }
      },
    },
    usage, budgetUsd: () => 100,
    onOutcome: (o) => outcomes.push(o.id),
    onOverBudget: () => {},
    onFailed: (id) => failed.push(id),
    onBypass: (id) => bypassed.push(id),
    batchSize: 1, maxAttempts: 3, retryPauseMs: 0, logger: silentLogger, now: () => t,
  })

  // Tin độc (id=1) luôn làm lô của nó lỗi — thử lại đúng maxAttempts=3 lần rồi rơi vào onFailed như
  // một tin khó bình thường, KHÔNG được phép mở mạch ngắt giữa chừng.
  queue.enqueue({ id: 1, content: 'x', sentAt: 0 }); await queue.flush(); t += 1
  await queue.flush(); t += 1
  await queue.flush()
  assert.deepEqual(calls, [[1], [1], [1]])
  assert.deepEqual(failed, [1])
  assert.deepEqual(bypassed, [])

  // Lô tiếp theo (tin lành, id=2): mạch ngắt KHÔNG được mở dù vừa có 3 lô lỗi liên tiếp (toàn của 1 tin
  // độc) — extractor vẫn được gọi bình thường, không đi thẳng fallback.
  queue.enqueue({ id: 2, content: 'x', sentAt: 0 })
  await queue.flush()
  assert.deepEqual(calls, [[1], [1], [1], [2]])
  assert.deepEqual(outcomes, [2])
  assert.deepEqual(bypassed, [])
})
