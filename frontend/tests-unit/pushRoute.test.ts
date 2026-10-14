// frontend/tests-unit/pushRoute.test.ts
// Chạy bằng Node test runner (Node 22 tự bỏ type): npm run test:unit
// Không nằm trong tsconfig (src) — chỉ import module thuần, không alias '@/'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pushRoute } from '../src/push/route.ts'

test('action có booking_id', () => {
  assert.equal(pushRoute({ action: 'view_booking', booking_id: 7 }), '/customer/booking/7')
  assert.equal(pushRoute({ action: 'view_trip', booking_id: '42' }), '/driver/trips/42')
})

test('view_wallet', () => {
  assert.equal(pushRoute({ action: 'view_wallet' }), '/driver/wallet')
})

test('open_url chỉ nhận đường dẫn nội bộ', () => {
  assert.equal(pushRoute({ action: 'open_url', url: '/driver/free' }), '/driver/free')
  assert.equal(pushRoute({ action: 'open_url', url: '//evil.com/x' }), '/')
  assert.equal(pushRoute({ action: 'open_url', url: 'https://evil.com' }), '/')
  assert.equal(pushRoute({ action: 'open_url' }), '/')
})

test('thiếu dữ liệu hoặc action lạ thì về trang chủ', () => {
  assert.equal(pushRoute({ action: 'view_trip' }), '/')
  assert.equal(pushRoute({ action: 'unknown', booking_id: 1 }), '/')
  assert.equal(pushRoute({}), '/')
})
