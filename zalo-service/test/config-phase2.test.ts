import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('phase 2 defaults', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's' })
  assert.equal(cfg.aiModel, 'claude-haiku-4-5')
  assert.equal(cfg.aiEnabled, false)
  assert.equal(cfg.aiBatchSize, 20)
  assert.equal(cfg.aiFlushMs, 3000)
  assert.equal(cfg.aiDailyBudgetUsd, 5)
  assert.equal(cfg.ridesBatchSize, 100)
  assert.equal(cfg.ridesFlushMs, 2000)
  assert.equal(cfg.configPollMs, 60_000)
  assert.equal(cfg.groupsSyncMs, 600_000)
  assert.equal(cfg.qrIntervalMs, 2000)
  assert.equal(cfg.qrRefreshDays, 7)
  assert.equal(cfg.rideExpireAfterPickupMs, 1_800_000)
  assert.equal(cfg.rideExpireWithoutTimeMs, 10_800_000)
})

test('AI is enabled when an Anthropic key is present', () => {
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', ANTHROPIC_API_KEY: 'sk-x' }).aiEnabled, true)
})
