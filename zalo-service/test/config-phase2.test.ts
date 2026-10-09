import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('phase 2 defaults', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's' })
  // Giai đoạn 5: mặc định chuyển sang OpenAI gpt-4.1-mini (xem spec giai đoạn 5, mục 6).
  assert.equal(cfg.aiProvider, 'openai')
  assert.equal(cfg.aiModel, 'gpt-4.1-mini')
  assert.equal(cfg.aiEnabled, false)
  assert.equal(cfg.aiBatchSize, 20)
  assert.equal(cfg.aiFlushMs, 30_000)
  assert.equal(cfg.aiDailyBudgetUsd, 5)
  assert.equal(cfg.ridesBatchSize, 100)
  assert.equal(cfg.ridesFlushMs, 30_000)
  assert.equal(cfg.configPollMs, 60_000)
  assert.equal(cfg.groupsSyncMs, 600_000)
  assert.equal(cfg.groupScanMs, 1_800_000)
  assert.equal(cfg.qrIntervalMs, 2000)
  assert.equal(cfg.qrRefreshDays, 7)
  assert.equal(cfg.rideExpireAfterPickupMs, 1_800_000)
  assert.equal(cfg.rideExpireWithoutTimeMs, 10_800_000)
})

test('AI is enabled when the key of the selected provider is present', () => {
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', OPENAI_API_KEY: 'sk-x' }).aiEnabled, true)
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', ANTHROPIC_API_KEY: 'sk-x' }).aiEnabled, false)
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-x' }).aiEnabled, true)
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', AI_PROVIDER: 'anthropic', OPENAI_API_KEY: 'sk-x' }).aiEnabled, false)
})

test('AI_PROVIDER=anthropic switches the default model back to claude-haiku-4-5', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', AI_PROVIDER: 'anthropic' })
  assert.equal(cfg.aiProvider, 'anthropic')
  assert.equal(cfg.aiModel, 'claude-haiku-4-5')
})

test('AI_MODEL overrides the provider default', () => {
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', AI_MODEL: 'gpt-4o-mini' }).aiModel, 'gpt-4o-mini')
})

test('rides batch size is capped at 100 (Laravel rejects larger batches with 422)', () => {
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', RIDES_BATCH_SIZE: '500' }).ridesBatchSize, 100)
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', RIDES_BATCH_SIZE: '50' }).ridesBatchSize, 50)
})
