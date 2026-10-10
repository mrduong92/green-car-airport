// frontend/tests-unit/appVersion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, evaluateGate } from '../src/utils/appVersion.ts'

const info = (min: string, latest: string) => ({ min_supported: min, latest, store_url: 'https://s' })

test('so sánh theo số, không theo chuỗi', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
})

test('chuỗi sai định dạng → null', () => {
  assert.equal(compareVersions('', '1.0.0'), null)
  assert.equal(compareVersions('1.0', '1.0.0'), null)
  assert.equal(compareVersions('1.0.0', 'abc'), null)
})

test('thấp hơn min → chặn', () => {
  assert.deepEqual(evaluateGate('1.0.0', info('1.1.0', '1.2.0')), { state: 'blocked', storeUrl: 'https://s' })
})

test('đạt min nhưng thấp hơn latest → nhắc', () => {
  assert.deepEqual(evaluateGate('1.1.0', info('1.1.0', '1.2.0')), { state: 'soft', storeUrl: 'https://s' })
})

test('mới nhất → ok', () => {
  assert.deepEqual(evaluateGate('1.2.0', info('1.1.0', '1.2.0')), { state: 'ok' })
})

test('dữ liệu sai → cho qua (fail-open)', () => {
  assert.deepEqual(evaluateGate('1.0.0', info('', '')), { state: 'ok' })
  assert.deepEqual(evaluateGate('', info('9.0.0', '9.0.0')), { state: 'ok' })
})
