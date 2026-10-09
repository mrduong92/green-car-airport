// Microservice Zalo (Cuốc Free): nghe tin từ N tài khoản phụ, LƯU NGAY vào SQLite, tách cuốc (AI trước,
// quy tắc chỉ dự phòng khi AI hỏng/hết ngân sách → nguyên văn), gửi cuốc + nhóm + heartbeat cho Laravel.
// CHỈ ĐỌC: không gọi bất kỳ API ghi nào của Zalo.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { Zalo, type Credentials } from 'zca-js'
import { loadConfig } from './config.js'
import { loadAccounts } from './account-files.js'
import { openDb } from './db.js'
import { MessageStore } from './store.js'
import { GroupNames } from './groups.js'
import { createIngestor, newCounters } from './ingest.js'
import { AccountManager, type ApiLike } from './accounts.js'
import { buildHeartbeat, collectHeartbeatExtra, heartbeatAccounts } from './heartbeat.js'
import { createGetter, createSender } from './http.js'
import { logger } from './logger.js'
import { SenderStore } from './senders.js'
import { accountsForGroup, accountsForSender, tryAccounts } from './account-routing.js'
import { QrQueue, decodeQrFromUrl } from './qr.js'
import { RideStore } from './rides.js'
import { AiUsage } from './ai/usage.js'
import { AiQueue } from './ai/queue.js'
import { AnthropicExtractor } from './ai/extractor.js'
import { OpenAiExtractor } from './ai/openai-extractor.js'
import { ConfigPoller } from './remote-config.js'
import { Processor, onAiFailed } from './processor.js'
import { GroupsSync, RideSync } from './sync.js'
import { GroupScanner, accountGroupCounts, forgetAccount, pruneUnknownAccounts } from './group-scanner.js'
import { AccountRequestsPoller } from './account-requests.js'
import { runQrLogin } from './zalo-login.js'
import type { IncomingMessage } from './normalize.js'

const HOUR = 3_600_000
const cfg = loadConfig(process.env)

const accounts = loadAccounts(cfg.accountsDir, logger)
// Giai đoạn 5: chưa có nick vẫn chạy — admin thêm nick bằng QR trên trang "Nick Zalo".
if (accounts.length === 0) {
  logger.error(`Chưa có tài khoản nào trong ${cfg.accountsDir} — thêm nick ở trang admin (Cuốc Free → Nick Zalo)`)
}

const db = openDb(cfg.dbPath)
// Nick đã gỡ khỏi thư mục tài khoản: xoá dấu "đang ở nhóm" của nó để nhóm chỉ nick đó ở có thể thành "rời".
const prunedAccountRows = pruneUnknownAccounts(db, accounts.map((a) => a.id))
if (prunedAccountRows > 0) logger.info(`Đã xoá ${prunedAccountRows} dấu nhóm của nick không còn cấu hình`)
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
    const apis = new Map((manager?.loggedIn() ?? []).map((a) => [a.id, a.api]))
    return tryAccounts(accountsForGroup(db, groupId, [...apis.keys()]), async (id) =>
      (await apis.get(id)!.getGroupInfo(groupId)).gridInfoMap?.[groupId]?.name ?? '')
  },
})
const send = createSender({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const get = createGetter({ baseUrl: cfg.apiBaseUrl, secret: cfg.botSecret })
const rides = new RideStore(db, { expireAfterPickupMs: cfg.rideExpireAfterPickupMs, expireWithoutTimeMs: cfg.rideExpireWithoutTimeMs })
const usage = new AiUsage(db, undefined, cfg.aiModel)

// processor được gán ngay bên dưới; các callback chỉ chạy khi đã có tin.
let processor: Processor | undefined
// Mã deeplink người gửi: lấy qua tài khoản đang đăng nhập, cách nhau qrIntervalMs. Chỉ người có tin thành
// cuốc (Processor gọi qr.ensure) — ít lời gọi getQR hơn, giảm rủi ro Zalo khoá tài khoản. Có mã mới →
// đánh dấu cuốc của người đó để gửi (lại) sang Laravel.
const senders = new SenderStore(db)
const qr = new QrQueue({
  senders,
  // Gọi bằng nick đã nhận tin của người này trước (Zalo chỉ trả QR cho nick có chung nhóm), lỗi thì thử nick khác.
  getQr: async (uid) => {
    const apis = new Map((manager?.loggedIn() ?? []).map((a) => [a.id, a.api]))
    return tryAccounts(accountsForSender(db, uid, [...apis.keys()]), (id) => apis.get(id)!.getQR(uid))
  },
  decode: decodeQrFromUrl,
  onUpdated: (uid) => rides.markSenderChanged(uid),
  refreshMs: cfg.qrRefreshDays * 24 * HOUR,
  logger,
})

const remote = new ConfigPoller({ get, onQrRefresh: (uids) => uids.forEach((uid) => qr.force(uid)), fallbackBudgetUsd: cfg.aiDailyBudgetUsd, logger })
// Dựng client/extractor bên trong nhánh aiEnabled: SDK openai (khác @anthropic-ai/sdk) ném lỗi ngay tại
// constructor khi thiếu OPENAI_API_KEY — dựng sớm sẽ làm service không khởi động nổi khi chưa cấu hình AI.
const ai = cfg.aiEnabled
  ? new AiQueue({
      // Timeout 60 giây, thử lại 1 lần trong SDK: hàng chờ tự thử lại (tối đa 3 lần/tin) — tránh treo lô quá lâu.
      extractor: cfg.aiProvider === 'anthropic'
        ? new AnthropicExtractor(new Anthropic({ timeout: 60_000, maxRetries: 1 }), cfg.aiModel)
        : new OpenAiExtractor(new OpenAI({ timeout: 60_000, maxRetries: 1 }), cfg.aiModel),
      usage,
      budgetUsd: () => remote.current().aiDailyBudgetUsd,
      onOutcome: (outcome) => processor?.applyAi(outcome),
      onOverBudget: (id) => processor?.fallback(id),
      onFailed: onAiFailed(() => processor, logger),
      batchSize: cfg.aiBatchSize,
      logger,
    })
  : null
if (!ai) logger.info(`Chưa có ${cfg.aiProvider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} — tin khó sẽ hiển thị nguyên văn`)
processor = new Processor({
  messages: store, rides, ai, qr, config: () => remote.current(), logger, rideExpireWithoutTimeMs: cfg.rideExpireWithoutTimeMs,
  duplicateWindowMs: cfg.duplicateWindowHours * HOUR,
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
const groupScanner = new GroupScanner({ db, accounts: () => manager!.loggedIn(), logger })
const every = (ms: number, fn: () => Promise<void> | void) =>
  setInterval(() => { Promise.resolve().then(fn).catch((err) => logger.error('Lỗi tác vụ định kỳ:', err)) }, ms)

// Đăng ký heartbeat và mọi tác vụ định kỳ TRƯỚC khi hỏi cấu hình / đăng nhập: một tài khoản đăng nhập treo
// không được chặn heartbeat (nếu không Laravel chỉ thấy service "chết" mà không biết vì sao).
const startedAt = Date.now()

every(cfg.heartbeatMs, async () => {
  const now = Date.now()
  const payload = buildHeartbeat({
    serviceId: cfg.serviceId, startedAt, now, counters,
    accounts: heartbeatAccounts(manager!.snapshot(), (id) => manager!.info(id), accountGroupCounts(db)),
    extra: collectHeartbeatExtra({ now, rides, senders, qr, ai, usage, budgetUsd: remote.current().aiDailyBudgetUsd }),
  })
  const { status } = await send('/api/internal/zalo/heartbeat', payload)
  if (status !== 200) logger.error('Heartbeat lỗi HTTP', status || 'mạng')
})

every(cfg.ridesFlushMs, () => rideSync.flush())
every(cfg.aiFlushMs, () => ai?.flush())
// Chưa nick nào đăng nhập thì chưa lấy mã: gọi lúc này chỉ đánh lỗi người bắn và bắt chờ 1 giờ.
every(cfg.qrIntervalMs, () => ((manager?.loggedIn().length ?? 0) > 0 ? qr.step() : undefined))
every(cfg.configPollMs, () => remote.poll())
every(cfg.groupsSyncMs, () => groupsSync.flush())

// Đăng nhập / gỡ nick theo yêu cầu từ trang admin (giai đoạn 5). poll() không ném lỗi, tự bỏ lượt khi đang
// xử lý một yêu cầu (đăng nhập QR có thể kéo dài vài phút).
const accountRequests = new AccountRequestsPoller({
  get,
  post: send,
  manager,
  accountsDir: cfg.accountsDir,
  login: (onQr) => runQrLogin({
    loginQR: (onEvent) => new Zalo({ selfListen: false, logging: false }).loginQR({}, onEvent as Parameters<Zalo['loginQR']>[1]),
    onQr,
  }),
  logger,
  // Nick mới/đăng nhập lại → quét nhóm ngay để danh sách nhóm và số nhóm cập nhật, không chờ 30 phút.
  onAdded: () => { groupScanner.scan().then(() => groupsSync.flush()).catch((err) => logger.error('Quét nhóm lỗi:', err)) },
  onRemoved: (id) => {
    const n = forgetAccount(db, id)
    if (n > 0) logger.info(`Đã xoá ${n} dấu nhóm của nick ${id}`)
  },
})
every(cfg.accountRequestsPollMs, () => accountRequests.poll())

// Quét toàn bộ nhóm của nick phụ (giai đoạn 4): lần đầu khi MỌI nick đã đăng nhập xong hoặc đã báo lỗi
// (quét sớm khi nick khác còn đang đăng nhập làm nhóm của nick đó tạm hiện "Nick đã rời"), tối đa chờ
// 2 phút kể từ lúc khởi động; cần ít nhất 1 nick đăng nhập. Sau đó mỗi groupScanMs.
const FIRST_SCAN_MAX_WAIT_MS = 2 * 60_000
const firstGroupScan = setInterval(() => {
  if (manager!.loggedIn().length === 0) return
  const states = manager!.snapshot()
  const settled = states.length >= accounts.length && states.every((a) => a.loggedIn || a.lastError !== undefined)
  if (!settled && Date.now() - startedAt < FIRST_SCAN_MAX_WAIT_MS) return
  clearInterval(firstGroupScan)
  groupScanner.scan().then(() => groupsSync.flush()).catch((err) => logger.error('Quét nhóm lỗi:', err))
}, 5_000)
every(cfg.groupScanMs, () => groupScanner.scan().then(() => groupsSync.flush()))

setInterval(() => {
  const deleted = store.prune()
  if (deleted > 0) logger.info(`Đã xoá ${deleted} tin thô quá ${cfg.retentionDays} ngày`)
  rides.prune()
}, HOUR)

// Hỏi cấu hình (nhóm tắt, người bị ẩn) rồi xếp lại tin dở dang TRƯỚC khi có tin mới — không cần đăng nhập;
// poll không ném lỗi và có timeout 10 giây.
await remote.poll()
processor.recover(Date.now())
// Người bắn đang có cuốc chờ mã QR (vd. lần trước gọi nhầm nick nên lỗi) → lấy lại ngay khi có nick đăng nhập.
for (const uid of rides.sendersAwaitingQr()) qr.force(uid)

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
