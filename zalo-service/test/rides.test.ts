import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { SenderStore } from '../src/senders.js'
import { RideStore } from '../src/rides.js'
import { contentHash } from '../src/text.js'
import { AIRPORT, type RideDraft } from '../src/parser/rules.js'

const HOUR = 3_600_000
const T0 = 1_759_500_000_000

function setup() {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  const senders = new SenderStore(db)
  let t = T0
  let n = 0
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => t, uid: () => `r${++n}` })
  messages.save({ group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: 'm1', sender_uid: '111', sender_name: 'Đức', content: 'tiễn 5h phố cổ', sent_at: T0 }, 'acc1')
  // Người bắn '111' đã có mã QR sẵn — phần lớn test kiểm unsynced()/backlog() cần cuốc lọt qua
  // điều kiện "chỉ gửi cuốc của người có mã QR" (quyết định GreenCA, xem task-5 overrides).
  senders.saveQr('111', 'code1', 'ok', 0)
  const source = { messageId: messages.findId('g1', 'm1')!, senderUid: '111', groupId: 'g1', sentAt: T0 }
  return { db, messages, senders, rides, source, setNow: (v: number) => { t = v } }
}

function draft(overrides: Partial<RideDraft> = {}): RideDraft {
  return {
    direction: 'to_airport', pickup: 'phố cổ', destination: AIRPORT, pickupAt: T0 + 2 * HOUR, pickupTimeText: '5h',
    seats: 5, vehicleNote: null, price: 200000, isFree: false, rawText: 'tiễn 5h phố cổ', ...overrides,
  }
}

test('creates a ride with expiry 30 minutes after pickup and a full payload', () => {
  const { rides, source } = setup()
  assert.deepEqual(rides.upsertDrafts(source, [draft()]), { created: 1, merged: 0 })
  const [p] = rides.unsynced(10)
  assert.equal(p.ride_uid, 'r1')
  assert.equal(p.sender_name, 'Đức')
  assert.equal(p.group_name, 'Taxi Nội Bài')
  assert.equal(p.qr_code, 'code1')
  assert.equal(p.expires_at, T0 + 2 * HOUR + 30 * 60_000)
  assert.equal(p.is_free, false)
  assert.equal(p.group_count, 1)
})

test('a ride without time expires 3 hours after posting', () => {
  const { rides, source } = setup()
  rides.addRaw(source, 'tin khó hiểu')
  const [p] = rides.unsynced(10)
  assert.equal(p.is_raw, true)
  assert.equal(p.expires_at, T0 + 3 * HOUR)
})

test('multi-ride message creates two rides', () => {
  const { rides, source } = setup()
  assert.deepEqual(rides.upsertDrafts(source, [draft(), draft({ pickup: 'Tương Mai', pickupAt: T0 + 3 * HOUR })]), { created: 2, merged: 0 })
  assert.equal(rides.backlog(), 2)
})

test('the same ride reposted (reformatted) merges and bumps group_count', () => {
  const { rides, source } = setup()
  rides.upsertDrafts(source, [draft()])
  assert.deepEqual(rides.upsertDrafts({ ...source, groupId: 'g2' }, [draft({ pickup: 'Phố  Cổ' })]), { created: 0, merged: 1 })
  assert.equal(rides.unsynced(10)[0].group_count, 2)
})

test('a duplicate message bumps the original rides', () => {
  const { rides, messages, source } = setup()
  rides.upsertDrafts(source, [draft()])
  messages.setStatus(source.messageId, 'ride')
  assert.equal(rides.bumpForDuplicate('111', contentHash('111', 'tiễn 5h phố cổ')), 1)
  assert.equal(rides.unsynced(10)[0].group_count, 2)
})

test('sync bookkeeping: synced rides leave the outbox, updated rides come back', () => {
  const { rides, source, setNow } = setup()
  rides.upsertDrafts(source, [draft()])
  rides.markSynced(['r1'], T0)
  assert.equal(rides.backlog(), 0)
  setNow(T0 + 1000)
  assert.equal(rides.markSenderChanged('111'), 1)
  assert.deepEqual(rides.unsynced(10).map((r) => r.ride_uid), ['r1'])
})

test('prune removes rides expired over a day', () => {
  const { rides, source } = setup()
  rides.upsertDrafts(source, [draft({ pickupAt: T0 - 30 * HOUR })])
  assert.equal(rides.prune(T0), 1)
})

test('rides of a sender without a QR code are held back', () => {
  const { messages, senders, rides } = setup()
  messages.save({ group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: 'm2', sender_uid: '222', sender_name: 'Lan', content: 'tiễn 6h phố cổ', sent_at: T0 }, 'acc1')
  const source2 = { messageId: messages.findId('g1', 'm2')!, senderUid: '222', groupId: 'g1', sentAt: T0 }

  rides.upsertDrafts(source2, [draft({ pickupAt: T0 + 3 * HOUR, pickupTimeText: '6h' })])
  assert.equal(rides.unsynced(10).some((r) => r.sender_uid === '222'), false)
  assert.equal(rides.backlog(), 0)

  // Có trạng thái 'empty' (đã kiểm nhưng không có mã) vẫn bị giữ lại, không phải chỉ thiếu hàng senders.
  senders.saveQr('222', null, 'empty', 0)
  assert.equal(rides.unsynced(10).some((r) => r.sender_uid === '222'), false)
  assert.equal(rides.backlog(), 0)

  senders.saveQr('222', 'abc', 'ok', T0)
  rides.markSenderChanged('222')
  const payload = rides.unsynced(10).find((r) => r.sender_uid === '222')
  assert.ok(payload)
  assert.equal(payload?.qr_code, 'abc')
  assert.equal(rides.backlog(), 1)
})

test('an expired unsynced ride is neither sent nor counted in the backlog', () => {
  const { rides, source, setNow } = setup()
  rides.upsertDrafts(source, [draft({ pickupAt: T0 + HOUR })]) // hết hạn lúc T0 + 1h30
  assert.equal(rides.backlog(), 1)
  setNow(T0 + 2 * HOUR)
  assert.deepEqual(rides.unsynced(10), [])
  assert.equal(rides.backlog(), 0)
})

test('a temporary getQR error keeps the old code and rides are still sent; no code is held back', () => {
  const { rides, senders, source } = setup()
  rides.upsertDrafts(source, [draft()])
  senders.saveQr('111', null, 'error', T0) // lỗi tạm thời: giữ mã cũ 'code1'
  assert.equal(rides.unsynced(10)[0]?.qr_code, 'code1')
  assert.equal(rides.backlog(), 1)

  senders.saveQr('111', null, 'empty', T0) // người bắn tắt mã QR → không còn mã
  assert.deepEqual(rides.unsynced(10), [])
  assert.equal(rides.backlog(), 0)
})

test('heldBack counts unexpired unsynced rides whose sender has no QR code', () => {
  const { messages, senders, rides, source, setNow } = setup()
  rides.upsertDrafts(source, [draft()]) // người '111' có mã → không tính
  messages.save({ group_id: 'g1', group_name: '', msg_id: 'm2', sender_uid: '222', sender_name: 'Lan', content: 'tiễn 6h phố cổ', sent_at: T0 }, 'acc1')
  const source2 = { messageId: messages.findId('g1', 'm2')!, senderUid: '222', groupId: 'g1', sentAt: T0 }
  rides.upsertDrafts(source2, [draft({ pickup: 'A', pickupAt: T0 + HOUR }), draft({ pickup: 'B', pickupAt: T0 + 3 * HOUR })])
  assert.equal(rides.heldBack(), 2)
  senders.saveQr('222', null, 'empty', T0)
  assert.equal(rides.heldBack(), 2)
  setNow(T0 + 2 * HOUR) // cuốc 'A' hết hạn
  assert.equal(rides.heldBack(), 1)
  senders.saveQr('222', 'abc', 'ok', T0)
  assert.equal(rides.heldBack(), 0)
})
