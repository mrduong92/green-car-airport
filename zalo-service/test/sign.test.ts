import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sign } from '../src/sign.js'

// Cùng vector với ZaloBotSignatureTest::test_known_vector_shared_with_node_service_passes (PHP).
test('matches the vector shared with the Laravel middleware', () => {
  const body = '{"bot_id":"bot-1","messages":[{"content":"4h30 Tiễn Hoài Đức"}]}'
  const { timestamp, signature } = sign('test-secret', body, 1_700_000_000_000)
  assert.equal(timestamp, '1700000000')
  assert.equal(signature, '1b79231e73c3fcd9383c96d959e1b1fcd6376675df5231d2ea3e66e943aeb4b7')
})
