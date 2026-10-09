import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { SenderStore } from '../src/senders.js'
import { QrQueue } from '../src/qr.js'
import { AiQueue } from '../src/ai/queue.js'
import { AiUsage } from '../src/ai/usage.js'
import { Processor, onAiFailed } from '../src/processor.js'
import type { RemoteConfig } from '../src/remote-config.js'
import { silentLogger } from '../src/logger.js'

const HOUR = 3_600_000
const SENT = Date.parse('2026-10-04T01:30:00Z') - 7 * HOUR

function harness(opts: { ai?: boolean; config?: Partial<RemoteConfig> } = {}) {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => SENT })
  const senders = new SenderStore(db)
  const qr = new QrQueue({ senders, getQr: async () => ({}), decode: async () => null, onUpdated: () => {}, refreshMs: 7 * 24 * HOUR, logger: silentLogger, now: () => SENT })
  const ai = opts.ai === false ? null : new AiQueue({
    extractor: { extract: async () => ({ outcomes: [], inputTokens: 0, outputTokens: 0 }) },
    usage: new AiUsage(db), budgetUsd: () => 5, onOutcome: () => {}, onOverBudget: () => {}, onFailed: () => {}, logger: silentLogger,
  })
  const config: RemoteConfig = { disabledGroupIds: new Set(), blockedSenderUids: new Set(), aiDailyBudgetUsd: 5, ...opts.config }
  const processor = new Processor({ messages, rides, ai, qr, config: () => config, logger: silentLogger, rideExpireWithoutTimeMs: 3 * HOUR, duplicateWindowMs: 24 * HOUR })
  let n = 0
  const save = (content: string, overrides: Record<string, string | number> = {}) => {
    const item = { group_id: 'g1', group_name: '', msg_id: `m${++n}`, sender_uid: '111', sender_name: '', content, sent_at: SENT, ...overrides }
    messages.save(item, 'acc1')
    return messages.findId(item.group_id, item.msg_id)!
  }
  // Người bắn có mã QR (fetchedAt = 0 → vẫn đến hạn làm mới, ensure() vẫn xếp hàng) — cuốc mới vào hộp thư đi.
  const giveQr = (uid = '111') => senders.saveQr(uid, 'code1', 'ok', 0)
  return { db, messages, rides, senders, qr, ai, processor, save, giveQr }
}

test('with AI enabled, every message is sent to AI first — even one the rule parser could read directly', () => {
  const h = harness()
  for (const content of ['tiễn 4h15 phố cổ 200k', 'chào cả nhà', 'T1 - trần khát chân 180k freeeeeeee']) {
    const id = h.save(content)
    h.processor.handleStored(id)
    assert.equal(h.messages.get(id)!.parse_status, 'ai_pending')
  }
  assert.equal(h.ai!.size, 3)
})

test('without AI, handleStored falls back to the rule parser directly: rides / not_ride / raw', () => {
  const h = harness({ ai: false })

  const ride = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.handleStored(ride)
  assert.equal(h.messages.get(ride)!.parse_status, 'ride')
  assert.equal(h.qr.size, 1)
  assert.equal(h.rides.backlog(), 0) // chưa có mã QR → chưa gửi
  h.giveQr()
  assert.equal(h.rides.backlog(), 1)

  const chatter = h.save('chào cả nhà')
  h.processor.handleStored(chatter)
  assert.equal(h.messages.get(chatter)!.parse_status, 'not_ride')

  const ambiguousText = 'T1 - trần khát chân 180k freeeeeeee'
  const ambiguous = h.save(ambiguousText)
  h.processor.handleStored(ambiguous)
  assert.equal(h.messages.get(ambiguous)!.parse_status, 'raw')
  assert.equal(h.rides.unsynced(10).find((r) => r.raw_text === ambiguousText)?.is_raw, true)
})

test('fallback() (AI exhausted retries / over budget / no AI) applies the rule parser: rides, not_ride, or raw', () => {
  const h = harness()

  const ride = h.save('tiễn 4h15 phố cổ 200k')
  h.giveQr()
  h.processor.fallback(ride)
  assert.equal(h.messages.get(ride)!.parse_status, 'ride')
  assert.equal(h.rides.backlog(), 1)

  const chatter = h.save('chào cả nhà')
  h.processor.fallback(chatter)
  assert.equal(h.messages.get(chatter)!.parse_status, 'not_ride')

  const ambiguousText = 'T1 - trần khát chân 180k freeeeeeee'
  const ambiguous = h.save(ambiguousText)
  h.processor.fallback(ambiguous)
  assert.equal(h.messages.get(ambiguous)!.parse_status, 'raw')
  assert.equal(h.rides.unsynced(10).find((r) => r.raw_text === ambiguousText)?.is_raw, true)
})

test('disabled group and blocked sender are skipped', () => {
  const h = harness({ config: { disabledGroupIds: new Set(['g2']), blockedSenderUids: new Set(['spam']) } })
  const a = h.save('tiễn 5h phố cổ', { group_id: 'g2' })
  const b = h.save('tiễn 5h phố cổ', { sender_uid: 'spam' })
  h.giveQr('111')
  h.giveQr('spam')
  h.processor.handleStored(a)
  h.processor.handleStored(b)
  assert.equal(h.messages.get(a)!.parse_status, 'skipped_group')
  assert.equal(h.messages.get(b)!.parse_status, 'blocked')
  assert.equal(h.rides.backlog(), 0)
  assert.equal(h.qr.size, 0)
})

test('AI outcome is applied: rides or not_ride', () => {
  const h = harness()
  const id = h.save('tin khó')
  h.processor.applyAi({ id, isRide: false, rides: [] })
  assert.equal(h.messages.get(id)!.parse_status, 'not_ride')

  h.giveQr()
  const id2 = h.save('tin khó 2')
  h.processor.applyAi({ id: id2, isRide: true, rides: [{ direction: 'to_airport', pickup: 'phố cổ', destination: 'Sân bay Nội Bài', pickupAt: SENT + HOUR, pickupTimeText: '5h', seats: null, vehicleNote: null, price: null, isFree: false, rawText: 'tin khó 2' }] })
  assert.equal(h.messages.get(id2)!.parse_status, 'ride')
  assert.equal(h.rides.backlog(), 1)
})

test('a duplicate arriving while the original is still ai_pending is still counted once the AI applies', () => {
  const h = harness()
  const content = 'tin khó, có thể lặp lại'
  const original = h.save(content)
  h.processor.handleStored(original)
  assert.equal(h.messages.get(original)!.parse_status, 'ai_pending')

  // 2 tin trùng đến trong lúc tin gốc còn ai_pending: chưa có hàng rides nào gắn với tin gốc, nên
  // bumpForDuplicate (gọi qua handleDuplicate, như ingest.ts làm) không cộng được gì — đây là đúng bug cần sửa.
  h.save(content, { msg_id: 'dup1' })
  h.processor.handleDuplicate('111', content)
  h.save(content, { msg_id: 'dup2' })
  h.processor.handleDuplicate('111', content)

  h.giveQr()
  h.processor.applyAi({
    id: original, isRide: true,
    rides: [{ direction: 'to_airport', pickup: 'phố cổ', destination: 'Sân bay Nội Bài', pickupAt: SENT + HOUR, pickupTimeText: '5h', seats: null, vehicleNote: null, price: null, isFree: false, rawText: content }],
  })
  assert.equal(h.messages.get(original)!.parse_status, 'ride')
  // group_count phải đếm đủ: tin gốc + 2 tin trùng đã đến trước đó = 3.
  assert.equal(h.rides.unsynced(10)[0].group_count, 3)
})

test('recover re-queues ai_pending messages and sends unprocessed pending messages straight to AI', () => {
  const h = harness()
  const pendingAi = h.save('T1 - trần khát chân 180k')
  h.messages.setStatus(pendingAi, 'ai_pending')
  const unprocessed = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.recover(SENT + 60_000)
  // Giai đoạn 5: tin pending cũng vào thẳng hàng chờ AI (không còn tự tách bằng quy tắc trước).
  assert.equal(h.ai!.size, 2)
  assert.equal(h.messages.get(unprocessed)!.parse_status, 'ai_pending')
})

test('recover falls back to the rule parser for pending messages when there is no AI', () => {
  const h = harness({ ai: false })
  const unprocessed = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.recover(SENT + 60_000)
  assert.equal(h.messages.get(unprocessed)!.parse_status, 'ride')
})

test('recover expires pending/ai_pending messages older than the no-time ride lifetime, without AI or getQR', () => {
  const h = harness()
  const oldPending = h.save('tiễn 4h15 phố cổ 200k', { msg_id: 'old1' })
  const oldAi = h.save('T1 - trần khát chân 180k', { msg_id: 'old2' })
  h.messages.setStatus(oldAi, 'ai_pending')
  const fresh = h.save('tiễn 5h Tương Mai 250k', { msg_id: 'new1', sent_at: SENT + 3 * HOUR })
  h.processor.recover(SENT + 3 * HOUR + 60_000) // tin lúc SENT đã quá 3 giờ
  assert.equal(h.messages.get(oldPending)!.parse_status, 'expired')
  assert.equal(h.messages.get(oldAi)!.parse_status, 'expired')
  // Tin còn mới (chưa hết hạn) vẫn theo luồng bình thường: có AI → vào hàng chờ, không tự tách bằng quy tắc.
  assert.equal(h.messages.get(fresh)!.parse_status, 'ai_pending')
  assert.equal(h.ai!.size, 1) // chỉ tin còn mới — hai tin cũ đã expired trước khi tới vòng lặp enqueue
  assert.equal(h.qr.size, 0) // ai_pending chưa gọi getQR
})

test('a message whose AI batch failed 3 times ends as a raw ride, not discarded', async () => {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => SENT })
  const senders = new SenderStore(db)
  const qr = new QrQueue({ senders, getQr: async () => ({}), decode: async () => null, refreshMs: 7 * 24 * HOUR, logger: silentLogger, now: () => SENT })
  const config: RemoteConfig = { disabledGroupIds: new Set(), blockedSenderUids: new Set(), aiDailyBudgetUsd: 5 }
  let processor: Processor | undefined
  const ai = new AiQueue({
    extractor: { extract: async () => { throw new Error('mất mạng') } },
    usage: new AiUsage(db), budgetUsd: () => 5, onOutcome: () => {}, onOverBudget: () => {},
    onFailed: onAiFailed(() => processor, silentLogger), retryPauseMs: 0,
    // circuitBreakerThreshold cao để không vô tình mở mạch ngắt ở lần lỗi thứ 3 (mặc định 3, trùng
    // với 3 lần thử ở test này) — mạch ngắt có test riêng ở ai-queue-circuit-breaker.test.ts.
    circuitBreakerThreshold: 100, logger: silentLogger,
  })
  processor = new Processor({ messages, rides, ai, qr, config: () => config, logger: silentLogger, rideExpireWithoutTimeMs: 3 * HOUR, duplicateWindowMs: 24 * HOUR })
  messages.save({ group_id: 'g1', group_name: '', msg_id: 'm1', sender_uid: '111', sender_name: '', content: 'T1 - trần khát chân 180k freeeeeeee', sent_at: SENT }, 'acc1')
  const id = messages.findId('g1', 'm1')!
  processor.handleStored(id)
  assert.equal(messages.get(id)!.parse_status, 'ai_pending')
  for (let i = 0; i < 3; i++) await ai.flush()
  assert.equal(messages.get(id)!.parse_status, 'raw')
  senders.saveQr('111', 'code1', 'ok', 0)
  assert.equal(rides.unsynced(10)[0]?.is_raw, true)
})
