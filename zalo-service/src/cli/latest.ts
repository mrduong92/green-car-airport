// Xem tin mới nhất kèm deeplink người gửi: npm run latest -- --limit=20
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { latestMessages } from '../latest.js'

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 20
const db = new Database(join(process.env.DATA_DIR || './data', 'zalo.sqlite'), { readonly: true, fileMustExist: true })

const vnTime = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(5, 16).replace('T', ' ')
for (const m of latestMessages(db, limit)) {
  console.log(`[${vnTime(m.sent_at)}] ${m.group_name || '(chưa có tên nhóm)'} · ${m.sender_name || m.sender_uid} (${m.parse_status})`)
  console.log(`  ${m.content.replace(/\s+/g, ' ').slice(0, 160)}`)
  console.log(`  → ${m.deep_link ?? `(chưa có mã deeplink${m.qr_status ? `: ${m.qr_status}` : ''})`}`)
}
db.close()
