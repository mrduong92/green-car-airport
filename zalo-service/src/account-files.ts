import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Account } from './accounts.js'
import type { Logger } from './logger.js'

/**
 * Nạp các file session data/accounts/<tên>.json. Một file hỏng/ghi dở chỉ bỏ qua tài khoản đó
 * (ghi log), KHÔNG làm sập cả service kéo theo các tài khoản còn tốt.
 */
export function loadAccounts(dir: string, logger: Logger): Account[] {
  if (!existsSync(dir)) return []
  const accounts: Account[] = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const id = basename(file, '.json')
    try {
      accounts.push({ id, credentials: JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown })
    } catch (err) {
      logger.error(`Tài khoản ${id}: file session hỏng (${err instanceof Error ? err.message : String(err)}) — bỏ qua`)
    }
  }
  return accounts
}
