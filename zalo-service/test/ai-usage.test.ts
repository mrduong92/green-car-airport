import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'
import { priceFor } from '../src/ai/prices.js'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`)

test('records cost per call and sums per Vietnam day (giá mặc định claude-haiku-4-5: $1/$5 mỗi 1M token)', () => {
  let t = Date.parse('2026-10-04T16:00:00Z') // 23:00 giờ VN ngày 04/10
  const usage = new AiUsage(openDb(':memory:'), () => t)

  near(usage.record(1_000_000, 0), 1)
  near(usage.record(0, 200_000), 1)
  near(usage.spentToday(), 2)

  t += 2 * 3_600_000 // 01:00 giờ VN ngày 05/10 → ngày mới
  assert.equal(usage.spentToday(), 0)
  assert.equal(usage.vnDay(t), '2026-10-05')
  assert.equal(usage.vnDay(Date.parse('2026-10-04T16:59:59Z')), '2026-10-04')
})

test('cost is priced per the configured model (gpt-4.1-mini: $0.40/$1.60 mỗi 1M token)', () => {
  const usage = new AiUsage(openDb(':memory:'), () => 0, 'gpt-4.1-mini')
  near(usage.record(1_000_000, 0), 0.4)
  near(usage.record(0, 1_000_000), 1.6)
})

test('priceFor: known models return their table price, unknown models return the highest price in the table', () => {
  assert.deepEqual(priceFor('gpt-4.1-mini'), { inputPerM: 0.4, outputPerM: 1.6 })
  assert.deepEqual(priceFor('gpt-4.1'), { inputPerM: 2, outputPerM: 8 })
  assert.deepEqual(priceFor('gpt-4o-mini'), { inputPerM: 0.15, outputPerM: 0.6 })
  assert.deepEqual(priceFor('gpt-4.1-nano'), { inputPerM: 0.1, outputPerM: 0.4 })
  assert.deepEqual(priceFor('gpt-5-nano'), { inputPerM: 0.05, outputPerM: 0.4 })
  assert.deepEqual(priceFor('claude-haiku-4-5'), { inputPerM: 1, outputPerM: 5 })
  // Model lạ → giá cao nhất bảng (gpt-4.1: $2/$8) để không vô tình tính thiếu, vượt trần ngân sách.
  assert.deepEqual(priceFor('model-khong-ton-tai'), { inputPerM: 2, outputPerM: 8 })
})

test('priceFor matches dated snapshots by prefix, longest key wins', () => {
  // "gpt-4.1-mini" (dài hơn) phải thắng "gpt-4.1" cho bản có ngày của gpt-4.1-mini.
  assert.deepEqual(priceFor('gpt-4.1-mini-2025-04-14'), { inputPerM: 0.4, outputPerM: 1.6 })
  assert.deepEqual(priceFor('gpt-4.1-2025-04-14'), { inputPerM: 2, outputPerM: 8 })
  assert.deepEqual(priceFor('gpt-4.1-nano-2025-04-14'), { inputPerM: 0.1, outputPerM: 0.4 })
  assert.deepEqual(priceFor('gpt-5-nano-2025-08-07'), { inputPerM: 0.05, outputPerM: 0.4 })
  assert.deepEqual(priceFor('gpt-4o-mini-2024-07-18'), { inputPerM: 0.15, outputPerM: 0.6 })
  // Chỉ khớp theo ranh giới dấu "-": "gpt-4.1-mininext" không phải bản có ngày của "gpt-4.1-mini"
  // (thiếu dấu "-" ngăn cách), nhưng vẫn khớp tiền tố "gpt-4.1-" nên nhận giá gpt-4.1, không nhầm sang "mini".
  assert.deepEqual(priceFor('gpt-4.1-mininext'), { inputPerM: 2, outputPerM: 8 })
})
