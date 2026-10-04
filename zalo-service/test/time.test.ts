import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDate, findTimes, resolvePickupAt } from '../src/parser/time.js'

const VN = 7 * 3_600_000
const vn = (ms: number) => new Date(ms + VN).toISOString().slice(0, 16).replace('T', ' ')
const at = (s: string) => Date.parse(s.replace(' ', 'T') + ':00Z') - VN // "2026-10-04 01:30" giờ VN → ms

test('a time later today stays today', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 01:30'), 4, 15)), '2026-10-04 04:15')
})

test('a time already passed today means tomorrow', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 22:00'), 5, 0)), '2026-10-05 05:00')
})

test('a time a few minutes ago stays today (late post)', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 05:10'), 5, 0)), '2026-10-04 05:00')
})

test('an explicit date is used, with year rollover', () => {
  assert.equal(vn(resolvePickupAt(at('2026-10-04 01:30'), 6, 45, 4, 10)), '2026-10-04 06:45')
  assert.equal(vn(resolvePickupAt(at('2026-12-31 20:00'), 7, 0, 2, 1)), '2027-01-02 07:00')
})

test('findTimes recognises common formats and ignores overlaps', () => {
  const pick = (t: string) => findTimes(t).map((x) => [x.hour, x.minute, x.text, x.relative])
  assert.deepEqual(pick('tiễn 4h15 phố cổ'), [[4, 15, '4h15', false]])
  assert.deepEqual(pick('8h30\' tiễn'), [[8, 30, "8h30'", false]])
  assert.deepEqual(pick('4/10 _7h00_ 50 Nguyễn Chí Thanh'), [[7, 0, '7h00', false]])
  assert.deepEqual(pick('X7  15-16h Tam Cốc'), [[15, 0, '15-16h', false]])
  assert.deepEqual(pick('12:30 khánh hội'), [[12, 30, '12:30', false]])
  assert.deepEqual(pick('0-30p bx vf8'), [[0, 30, '0-30p', true]])
  assert.deepEqual(pick('ck 200 0.25 xe 5 280,000đ'), [])
})

test('findDate reads day/month only', () => {
  assert.deepEqual(findDate('4/10  Tiễn  6h45'), { day: 4, month: 10, text: '4/10' })
  assert.equal(findDate('tiễn 6h45'), null)
})
