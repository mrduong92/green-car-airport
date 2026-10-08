// Microservice Zalo (Cuốc Free): nghe tin từ N tài khoản phụ, LƯU NGAY vào SQLite, tách cuốc (quy tắc → AI
// → nguyên văn), gửi cuốc + nhóm + heartbeat cho Laravel. CHỈ ĐỌC: không gọi bất kỳ API ghi nào của Zalo.
import Anthropic from '@anthropic-ai/sdk'
import { Zalo, type Credentials } from 'zca-js'
import { loadConfig } from './config.js'
import { loadAccounts } from './account-files.js'
import { openDb } from './db.js'
import { MessageStore } from './store.js'
import { GroupNames } from './groups.js'
import { createIngestor, newCounters } from './ingest.js'
import { AccountManager, type ApiLike } from './accounts.js'
import { buildHeartbeat, collectHeartbeatExtra } from './heartbeat.js'
import { createGetter, createSender } from './http.js'
import { logger } from './logger.js'
import { SenderStore } from './senders.js'
import { QrQueue, decodeQrFromUrl } from './qr.js'
import { RideStore } from './rides.js'
import { AiUsage } from './ai/usage.js'
import { AiQueue } from './ai/queue.js'
import { AnthropicExtractor } from './ai/extractor.js'
import { ConfigPoller } from './remote-config.js'
import { Processor, onAiFailed } from './processor.js'
import { GroupsSync, RideSync } from './sync.js'
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
const send = createSender({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const get = createGetter({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const rides = new RideStore(db, { expireAfterPickupMs: cfg.rideExpireAfterPickupMs, expireWithoutTimeMs: cfg.rideExpireWithoutTimeMs })
const usage = new AiUsage(db)

// processor được gán ngay bên dưới; các callback chỉ chạy khi đã có tin.
let processor: Processor | undefined
// Mã deeplink người gửi: lấy qua tài khoản đang đăng nhập, cách nhau qrIntervalMs. Chỉ người có tin thành
// cuốc (Processor gọi qr.ensure) — ít lời gọi getQR hơn, giảm rủi ro Zalo khoá tài khoản. Có mã mới →
// đánh dấu cuốc của người đó để gửi (lại) sang Laravel.
const senders = new SenderStore(db)
const qr = new QrQueue({
  senders,
  getQr: async (uid) => {
    const api = manager?.anyApi()
    if (!api) throw new Error('Chưa có tài khoản nào đăng nhập')
    return api.getQR(uid)
  },
  decode: decodeQrFromUrl,
  onUpdated: (uid) => rides.markSenderChanged(uid),
  refreshMs: cfg.qrRefreshDays * 24 * HOUR,
  logger,
})

const remote = new ConfigPoller({ get, onQrRefresh: (uids) => uids.forEach((uid) => qr.force(uid)), fallbackBudgetUsd: cfg.aiDailyBudgetUsd, logger })
const ai = cfg.aiEnabled
  ? new AiQueue({
      // Timeout 60 giây, thử lại 1 lần trong SDK: hàng chờ tự thử lại (tối đa 3 lần/tin) — tránh treo lô quá lâu.
      extractor: new AnthropicExtractor(new Anthropic({ timeout: 60_000, maxRetries: 1 }), cfg.aiModel),
      usage,
      budgetUsd: () => remote.current().aiDailyBudgetUsd,
      onOutcome: (outcome) => processor?.applyAi(outcome),
      onOverBudget: (id) => processor?.markRaw(id),
      onFailed: onAiFailed(() => processor, logger),
      batchSize: cfg.aiBatchSize,
      logger,
    })
  : null
if (!ai) logger.info('Chưa có ANTHROPIC_API_KEY — tin khó sẽ hiển thị nguyên văn')
processor = new Processor({
  messages: store, rides, ai, qr, config: () => remote.current(), logger, rideExpireWithoutTimeMs: cfg.rideExpireWithoutTimeMs,
})

const ingest = createIngestor({ store, groups, counters, allowedGroupIds: cfg.allowedGroupIds, processor })
if (cfg.allowedGroupIds.size > 0) logger.info(`Chỉ nhận tin từ ${cfg.allowedGroupIds.size} nhóm: ${[...cfg.allowedGroupIds].join(', ')}`)

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

const rideSync = new RideSync({ rides, send, batchSize: cfg.ridesBatchSize, logger })
const groupsSync = new GroupsSync({ db, send, logger })
const every = (ms: number, fn: () => Promise<void> | void) =>
  setInterval(() => { Promise.resolve().then(fn).catch((err) => logger.error('Lỗi tác vụ định kỳ:', err)) }, ms)

// Đăng ký heartbeat và mọi tác vụ định kỳ TRƯỚC khi hỏi cấu hình / đăng nhập: một tài khoản đăng nhập treo
// không được chặn heartbeat (nếu không Laravel chỉ thấy service "chết" mà không biết vì sao).
const startedAt = Date.now()

every(cfg.heartbeatMs, async () => {
  const now = Date.now()
  const payload = buildHeartbeat({
    serviceId: cfg.serviceId, startedAt, now, counters, accounts: manager!.snapshot(),
    extra: collectHeartbeatExtra({ now, rides, senders, qr, ai, usage, budgetUsd: remote.current().aiDailyBudgetUsd }),
  })
  const { status } = await send('/api/internal/zalo/heartbeat', payload)
  if (status !== 200) logger.error('Heartbeat lỗi HTTP', status || 'mạng')
})

every(cfg.ridesFlushMs, () => rideSync.flush())
every(cfg.aiFlushMs, () => ai?.flush())
every(cfg.qrIntervalMs, () => qr.step())
every(cfg.configPollMs, () => remote.poll())
every(cfg.groupsSyncMs, () => groupsSync.flush())

setInterval(() => {
  const deleted = store.prune()
  if (deleted > 0) logger.info(`Đã xoá ${deleted} tin thô quá ${cfg.retentionDays} ngày`)
  rides.prune()
}, HOUR)

// Hỏi cấu hình (nhóm tắt, người bị ẩn) rồi xếp lại tin dở dang TRƯỚC khi có tin mới — không cần đăng nhập;
// poll không ném lỗi và có timeout 10 giây.
await remote.poll()
processor.recover(Date.now())

// Đăng nhập không chờ: tài khoản treo/lỗi tự thử lại trong AccountManager.
manager.startAll().catch((err) => logger.error('Lỗi khởi động tài khoản:', err))

// Gửi danh sách nhóm ngay khi khởi động — không chờ 10 phút đầu (đọc từ SQLite, không cần tài khoản).
groupsSync.flush().catch((err) => logger.error('Đồng bộ danh sách nhóm lỗi:', err))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`Nhận ${signal}, dừng service`)
    manager?.stopAll()
    db.close()
    process.exit(0)
  })
}
