import type Database from 'better-sqlite3'
import type { Db } from '../db.js'

const VN_OFFSET_MS = 7 * 3_600_000
// Claude Haiku 4.5: $1 / 1 triệu token vào, $5 / 1 triệu token ra.
const INPUT_USD_PER_TOKEN = 1 / 1_000_000
const OUTPUT_USD_PER_TOKEN = 5 / 1_000_000

// Chi phí AI theo ngày giờ Việt Nam — dùng cho trần ngân sách và heartbeat.
export class AiUsage {
  private readonly upsert: Database.Statement
  private readonly select: Database.Statement

  constructor(db: Db, private readonly now: () => number = () => Date.now()) {
    this.upsert = db.prepare(`
      INSERT INTO ai_usage (day, calls, input_tokens, output_tokens, cost_usd) VALUES (?, 1, ?, ?, ?)
      ON CONFLICT (day) DO UPDATE SET calls = calls + 1, input_tokens = input_tokens + excluded.input_tokens,
        output_tokens = output_tokens + excluded.output_tokens, cost_usd = cost_usd + excluded.cost_usd`)
    this.select = db.prepare('SELECT cost_usd FROM ai_usage WHERE day = ?')
  }

  vnDay(ms: number): string {
    return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10)
  }

  record(inputTokens: number, outputTokens: number): number {
    const cost = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN
    this.upsert.run(this.vnDay(this.now()), inputTokens, outputTokens, cost)
    return cost
  }

  spentToday(): number {
    return (this.select.get(this.vnDay(this.now())) as { cost_usd: number } | undefined)?.cost_usd ?? 0
  }
}
