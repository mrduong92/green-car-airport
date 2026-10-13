import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('allowed groups and QR pacing', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's', ALLOWED_GROUP_IDS: ' g1, g2 ,,' })
  assert.deepEqual([...cfg.allowedGroupIds], ['g1', 'g2'])
  assert.equal(cfg.qrIntervalMs, 2000)
  assert.equal(cfg.qrRefreshDays, 7)
  assert.equal(loadConfig({ API_BASE_URL: 'https://a', BOT_SECRET: 's' }).allowedGroupIds.size, 0)
})
