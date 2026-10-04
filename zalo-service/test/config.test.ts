import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfig } from '../src/config.js'

test('throws when required env is missing', () => {
  assert.throws(() => loadConfig({ BOT_SECRET: 'x' }), /API_BASE_URL/)
  assert.throws(() => loadConfig({ API_BASE_URL: 'https://a' }), /BOT_SECRET/)
})

test('applies defaults, derives paths and strips trailing slash', () => {
  const cfg = loadConfig({ API_BASE_URL: 'https://greenca.vn/', BOT_SECRET: 's', DATA_DIR: '/data' })
  assert.equal(cfg.apiBaseUrl, 'https://greenca.vn')
  assert.equal(cfg.serviceId, 'zalo-1')
  assert.equal(cfg.dbPath, '/data/zalo.sqlite')
  assert.equal(cfg.accountsDir, '/data/accounts')
  assert.equal(cfg.heartbeatMs, 60_000)
  assert.equal(cfg.accountRetryMs, 60_000)
  assert.equal(cfg.retentionDays, 7)
  assert.equal(cfg.duplicateWindowHours, 24)
  assert.equal(cfg.maxContentLength, 4000)
})
