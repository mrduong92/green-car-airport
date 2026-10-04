import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { AiUsage } from '../src/ai/usage.js'

test('records cost per call and sums per Vietnam day', () => {
  let t = Date.parse('2026-10-04T16:00:00Z') // 23:00 giờ VN ngày 04/10
  const usage = new AiUsage(openDb(':memory:'), () => t)

  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`)
  near(usage.record(1_000_000, 0), 1)
  near(usage.record(0, 200_000), 1)
  near(usage.spentToday(), 2)

  t += 2 * 3_600_000 // 01:00 giờ VN ngày 05/10 → ngày mới
  assert.equal(usage.spentToday(), 0)
  assert.equal(usage.vnDay(t), '2026-10-05')
  assert.equal(usage.vnDay(Date.parse('2026-10-04T16:59:59Z')), '2026-10-04')
})
