// frontend/tests-unit/zalo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zaloProfileHref } from '../src/utils/zalo.ts'

const ANDROID = 'Mozilla/5.0 (Linux; Android 12; M2010J19SG) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const QR = 'zalo://qr/p/1exgvh8i95ps0'

test('web Android: intent:// để Chrome mở Zalo, có trang web dự phòng', () => {
  const href = zaloProfileHref(QR, ANDROID)
  assert.match(href, /^intent:\/\/zaloapp\.com\/qr\/p\/1exgvh8i95ps0#Intent;scheme=zalo;/)
  assert.match(href, /S\.browser_fallback_url=https%3A%2F%2Fzaloapp\.com%2Fqr%2Fp%2F1exgvh8i95ps0;end$/)
})

// WebView không hiểu intent:// — Capacitor chuyển nguyên URL cho Android, không app nào nhận
// scheme "intent" → bấm Nhận cuốc không có gì xảy ra. Gửi thẳng URL mà intent đó trỏ tới.
test('app native Android: zalo://zaloapp.com/... (WebView không hiểu intent://)', () => {
  assert.equal(zaloProfileHref(QR, ANDROID, true), 'zalo://zaloapp.com/qr/p/1exgvh8i95ps0')
})

test('iOS giữ nguyên zalo://qr/p/...', () => {
  assert.equal(zaloProfileHref(QR, IPHONE), QR)
  assert.equal(zaloProfileHref(QR, IPHONE, true), QR)
})

test('link không phải QR hồ sơ thì giữ nguyên', () => {
  assert.equal(zaloProfileHref('https://zalo.me/84901234567', ANDROID, true), 'https://zalo.me/84901234567')
})
