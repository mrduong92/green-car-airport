// Thống kê tin thô để chốt chi phí AI: npm run stats -- --hours=72
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { computeStats, formatStats } from '../stats.js'

const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 24
const db = new Database(join(process.env.DATA_DIR || './data', 'zalo.sqlite'), { readonly: true, fileMustExist: true })

console.log(formatStats(computeStats(db, hours), hours))
db.close()
