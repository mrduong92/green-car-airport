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
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const need = (key: string): string => {
    const value = env[key]
    if (!value) throw new Error(`Thiếu biến môi trường ${key}`)
    return value
  }
  const dataDir = env.DATA_DIR || './data'

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
  }
}
