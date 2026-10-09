import { join } from 'node:path'

export interface Config {
  apiBaseUrl: string
  botSecret: string
  serviceId: string
  dataDir: string
  dbPath: string
  accountsDir: string
  heartbeatMs: number
  accountRetryMs: number
  retentionDays: number
  duplicateWindowHours: number
  maxContentLength: number
  allowedGroupIds: Set<string>
  qrIntervalMs: number
  qrRefreshDays: number
  aiProvider: 'openai' | 'anthropic'
  aiModel: string
  aiEnabled: boolean
  aiBatchSize: number
  aiFlushMs: number
  aiDailyBudgetUsd: number
  ridesBatchSize: number
  ridesFlushMs: number
  configPollMs: number
  accountRequestsPollMs: number
  groupsSyncMs: number
  groupScanMs: number
  rideExpireAfterPickupMs: number
  rideExpireWithoutTimeMs: number
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const need = (key: string): string => {
    const value = env[key]
    if (!value) throw new Error(`Thiếu biến môi trường ${key}`)
    return value
  }
  const dataDir = env.DATA_DIR || './data'
  // Mặc định OpenAI (gpt-4.1-mini) — xem spec giai đoạn 5. Đặt AI_PROVIDER=anthropic để quay lại Claude.
  const aiProvider: 'openai' | 'anthropic' = env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'
  const defaultAiModel = aiProvider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4.1-mini'

  return {
    apiBaseUrl: need('API_BASE_URL').replace(/\/$/, ''),
    botSecret: need('BOT_SECRET'),
    serviceId: env.SERVICE_ID || 'zalo-1',
    dataDir,
    dbPath: join(dataDir, 'zalo.sqlite'),
    accountsDir: join(dataDir, 'accounts'),
    heartbeatMs: Number(env.HEARTBEAT_MS || 60_000),
    accountRetryMs: Number(env.ACCOUNT_RETRY_MS || 60_000),
    retentionDays: Number(env.RETENTION_DAYS || 7),
    duplicateWindowHours: Number(env.DUPLICATE_WINDOW_HOURS || 24),
    maxContentLength: Number(env.MAX_CONTENT_LENGTH || 4000),
    // Rỗng = nhận mọi nhóm. Lấy ID nhóm bằng: npm run groups -- <tài-khoản>
    allowedGroupIds: new Set((env.ALLOWED_GROUP_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean)),
    qrIntervalMs: Number(env.QR_INTERVAL_MS || 2000),
    qrRefreshDays: Number(env.QR_REFRESH_DAYS || 7),
    aiProvider,
    aiModel: env.AI_MODEL || defaultAiModel,
    aiEnabled: Boolean(aiProvider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY),
    aiBatchSize: Number(env.AI_BATCH_SIZE || 20),
    // Giãn nhịp AI (giai đoạn 5): chấp nhận trễ 30–60 giây để gom tin, giảm số lần gọi AI.
    aiFlushMs: Number(env.AI_FLUSH_MS || 30_000),
    aiDailyBudgetUsd: Number(env.AI_DAILY_BUDGET_USD || 5),
    // Laravel trả 422 cho lô > 100 (zalo.max_rides_batch) → hộp thư đi kẹt mãi; chặn trần ở đây.
    ridesBatchSize: Math.min(Number(env.RIDES_BATCH_SIZE || 100), 100),
    ridesFlushMs: Number(env.RIDES_FLUSH_MS || 30_000),
    configPollMs: Number(env.CONFIG_POLL_MS || 60_000),
    // Hỏi yêu cầu đăng nhập/gỡ nick từ trang admin (giai đoạn 5): QR Zalo chỉ sống ~100 giây nên hỏi dày.
    accountRequestsPollMs: Number(env.ACCOUNT_REQUESTS_POLL_MS || 5_000),
    groupsSyncMs: Number(env.GROUPS_SYNC_MS || 600_000),
    // Quét toàn bộ nhóm của nick phụ (giai đoạn 4): mặc định 30 phút.
    groupScanMs: Number(env.GROUP_SCAN_MS || 1_800_000),
    rideExpireAfterPickupMs: Number(env.RIDE_EXPIRE_AFTER_PICKUP_MS || 30 * 60_000),
    rideExpireWithoutTimeMs: Number(env.RIDE_EXPIRE_WITHOUT_TIME_MS || 3 * 3_600_000),
  }
}
