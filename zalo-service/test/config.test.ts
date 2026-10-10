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
  assert.equal(cfg.removedSessionRetentionDays, 7)
  assert.equal(cfg.leftGroupRetentionDays, 30)
  assert.equal(cfg.staleSenderDays, 30)
})

test('retention dọn dữ liệu đọc từ env', () => {
  const cfg = loadConfig({
    API_BASE_URL: 'https://x', BOT_SECRET: 's',
    REMOVED_SESSION_RETENTION_DAYS: '3', LEFT_GROUP_RETENTION_DAYS: '60', STALE_SENDER_DAYS: '45',
  })
  assert.equal(cfg.removedSessionRetentionDays, 3)
  assert.equal(cfg.leftGroupRetentionDays, 60)
  assert.equal(cfg.staleSenderDays, 45)
})
