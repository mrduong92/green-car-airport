import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAiConfigWarnings } from '../src/config.js'

// Bẫy nâng cấp: service giai đoạn 2 cũ có .env với AI_MODEL=claude-haiku-4-5, không có AI_PROVIDER.
// rsync giữ nguyên .env khi deploy giai đoạn 5 (không đè .env/data/) — nếu admin chỉ thêm AI_PROVIDER=openai
// mà quên sửa/xoá dòng AI_MODEL cũ, service sẽ gọi OpenAI với tên model Claude và lỗi ngay, không rõ vì sao.

test('no warning when provider and model agree, key present', () => {
  assert.deepEqual(
    detectAiConfigWarnings({ aiProvider: 'openai', aiModel: 'gpt-4.1-mini', aiEnabled: true }),
    [],
  )
  assert.deepEqual(
    detectAiConfigWarnings({ aiProvider: 'anthropic', aiModel: 'claude-haiku-4-5', aiEnabled: true }),
    [],
  )
})

test('warns when AI_PROVIDER=openai but AI_MODEL is a Claude model (upgrade trap)', () => {
  const warnings = detectAiConfigWarnings({ aiProvider: 'openai', aiModel: 'claude-haiku-4-5', aiEnabled: true })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /AI_PROVIDER=openai/)
  assert.match(warnings[0], /claude-haiku-4-5/)
})

test('warns when AI_PROVIDER=anthropic but AI_MODEL is an OpenAI model (gpt or o-series)', () => {
  assert.equal(detectAiConfigWarnings({ aiProvider: 'anthropic', aiModel: 'gpt-4.1-mini', aiEnabled: true }).length, 1)
  assert.equal(detectAiConfigWarnings({ aiProvider: 'anthropic', aiModel: 'o3-mini', aiEnabled: true }).length, 1)
})

test('warns when AI is disabled because the selected provider key is missing', () => {
  const warnings = detectAiConfigWarnings({ aiProvider: 'openai', aiModel: 'gpt-4.1-mini', aiEnabled: false })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /OPENAI_API_KEY/)

  const anthropicWarnings = detectAiConfigWarnings({ aiProvider: 'anthropic', aiModel: 'claude-haiku-4-5', aiEnabled: false })
  assert.match(anthropicWarnings[0], /ANTHROPIC_API_KEY/)
})

test('can report both a mismatch and a missing key at once', () => {
  const warnings = detectAiConfigWarnings({ aiProvider: 'openai', aiModel: 'claude-haiku-4-5', aiEnabled: false })
  assert.equal(warnings.length, 2)
})
