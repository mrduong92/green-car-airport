// Microservice Zalo (Cuốc Free) — giai đoạn 1: nghe tin từ N tài khoản phụ, LƯU NGAY vào SQLite,
// gửi heartbeat cho Laravel. CHỈ ĐỌC: không gọi bất kỳ API ghi nào của Zalo.
import { Zalo, type Credentials } from 'zca-js'
import { loadConfig } from './config.js'
import { loadAccounts } from './account-files.js'
import { openDb } from './db.js'
import { MessageStore } from './store.js'
import { GroupNames } from './groups.js'
import { createIngestor, newCounters } from './ingest.js'
import { AccountManager, type ApiLike } from './accounts.js'
import { buildHeartbeat } from './heartbeat.js'
import { createSender } from './http.js'
import { logger } from './logger.js'
import type { IncomingMessage } from './normalize.js'

const HOUR = 3_600_000
const cfg = loadConfig(process.env)

const accounts = loadAccounts(cfg.accountsDir, logger)
if (accounts.length === 0) {
  logger.error(`Chưa có tài khoản nào trong ${cfg.accountsDir} — chạy "npm run login -- <tên>" trên máy cá nhân rồi copy file lên`)
  process.exit(1)
}

const db = openDb(cfg.dbPath)
const store = new MessageStore(db, {
  duplicateWindowMs: cfg.duplicateWindowHours * HOUR,
  maxContentLength: cfg.maxContentLength,
  retentionMs: cfg.retentionDays * 24 * HOUR,
})
const counters = newCounters()

// manager được gán ngay bên dưới; fetchName chỉ chạy khi đã có tin, tức là sau khi đăng nhập.
let manager: AccountManager | undefined
const groups = new GroupNames({
  fetchName: async (groupId) => {
    const api = manager?.anyApi()
    if (!api) throw new Error('Chưa có tài khoản nào đăng nhập')
    return (await api.getGroupInfo(groupId)).gridInfoMap?.[groupId]?.name ?? ''
  },
})
const ingest = createIngestor({ store, groups, counters })

manager = new AccountManager({
  accounts,
  login: async (credentials) => {
    const api = await new Zalo({ selfListen: false, logging: false }).login(credentials as Credentials)
    return api as unknown as ApiLike
  },
  onMessage: (accountId, message) => {
    ingest(accountId, message as IncomingMessage).catch((err) => logger.error('Lỗi xử lý tin:', err))
  },
  logger,
  retryMs: cfg.accountRetryMs,
})

const send = createSender({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const startedAt = Date.now()

setInterval(async () => {
  const payload = buildHeartbeat({ serviceId: cfg.serviceId, startedAt, now: Date.now(), counters, accounts: manager!.snapshot() })
  const { status } = await send('/api/internal/zalo/heartbeat', payload)
  if (status !== 200) logger.error('Heartbeat lỗi HTTP', status || 'mạng')
}, cfg.heartbeatMs)

setInterval(() => {
  const deleted = store.prune()
  if (deleted > 0) logger.info(`Đã xoá ${deleted} tin thô quá ${cfg.retentionDays} ngày`)
}, HOUR)

// Đăng ký heartbeat TRƯỚC rồi mới đăng nhập, và không chờ: một tài khoản đăng nhập treo không được
// chặn heartbeat (nếu không Laravel chỉ thấy service "chết" mà không biết vì sao).
manager.startAll().catch((err) => logger.error('Lỗi khởi động tài khoản:', err))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`Nhận ${signal}, dừng service`)
    manager?.stopAll()
    db.close()
    process.exit(0)
  })
}
