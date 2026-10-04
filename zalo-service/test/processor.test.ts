import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { SenderStore } from '../src/senders.js'
import { QrQueue } from '../src/qr.js'
import { AiQueue } from '../src/ai/queue.js'
import { AiUsage } from '../src/ai/usage.js'
import { Processor } from '../src/processor.js'
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
  const processor = new Processor({ messages, rides, ai, qr, config: () => config, logger: silentLogger })
  let n = 0
  const save = (content: string, overrides: Record<string, string> = {}) => {
    const item = { group_id: 'g1', group_name: '', msg_id: `m${++n}`, sender_uid: '111', sender_name: '', content, sent_at: SENT, ...overrides }
    messages.save(item, 'acc1')
    return messages.findId(item.group_id, item.msg_id)!
  }
  // Người bắn có mã QR (fetchedAt = 0 → vẫn đến hạn làm mới, ensure() vẫn xếp hàng) — cuốc mới vào hộp thư đi.
  const giveQr = (uid = '111') => senders.saveQr(uid, 'code1', 'ok', 0)
  return { messages, rides, qr, ai, processor, save, giveQr }
}

test('rule-parsed message becomes rides and the sender is queued for QR', () => {
  const h = harness()
  const id = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'ride')
  assert.equal(h.qr.size, 1)
  assert.equal(h.rides.backlog(), 0) // chưa có mã QR → chưa gửi
  h.giveQr()
  assert.equal(h.rides.backlog(), 1)
})

test('chatter is marked not_ride and does not trigger a QR fetch', () => {
  const h = harness()
  const id = h.save('chào cả nhà')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'not_ride')
  assert.equal(h.qr.size, 0)
})

test('ambiguous message waits for AI; without AI it becomes a raw ride', () => {
  const h = harness()
  const id = h.save('T1 - trần khát chân 180k freeeeeeee')
  h.processor.handleStored(id)
  assert.equal(h.messages.get(id)!.parse_status, 'ai_pending')
  assert.equal(h.ai!.size, 1)

  const noAi = harness({ ai: false })
  const id2 = noAi.save('T1 - trần khát chân 180k freeeeeeee')
  noAi.giveQr()
  noAi.processor.handleStored(id2)
  assert.equal(noAi.messages.get(id2)!.parse_status, 'raw')
  assert.equal(noAi.rides.unsynced(10)[0].is_raw, true)
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

test('recover re-queues ai_pending and unprocessed pending messages', () => {
  const h = harness()
  const pendingAi = h.save('T1 - trần khát chân 180k')
  h.messages.setStatus(pendingAi, 'ai_pending')
  const unprocessed = h.save('tiễn 4h15 phố cổ 200k')
  h.processor.recover(SENT + 60_000)
  assert.equal(h.ai!.size, 1)
  assert.equal(h.messages.get(unprocessed)!.parse_status, 'ride')
})
