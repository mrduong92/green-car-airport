import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentHash, looksTimed, normalize } from '../src/text.js'

test('normalize collapses spacing, case and zero-width chars', () => {
  assert.equal(
    normalize('  4h30\tTiễn   khu đất dịch vụ​ xã Hoài Đức\n280,000đ '),
    '4h30 tiễn khu đất dịch vụ xã hoài đức 280,000đ',
  )
})

test('hash is the same for a reformatted text from the same sender', () => {
  const a = contentHash('111', '4h30 Tiễn Hoài Đức 280k')
  assert.equal(a, contentHash('111', '4h30  tiễn hoài đức\n280k'))
  assert.equal(a.length, 64)
  assert.notEqual(a, contentHash('222', '4h30 Tiễn Hoài Đức 280k'))
})

test('looksTimed detects common time formats only', () => {
  for (const t of ['5h tran nhan tong 200k', 'tiễn 4h15 phố cổ', '4/10 _7h00_ 50 Nguyễn Chí Thanh', '12:30 khánh hội']) {
    assert.equal(looksTimed(t), true, t)
  }
  for (const t of ['chào cả nhà', 'ck 200 0.25', 'xe 5 TK 0.25 280,000đ']) {
    assert.equal(looksTimed(t), false, t)
  }
})
