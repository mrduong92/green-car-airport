import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { MessageStore } from '../src/store.js'
import { RideStore } from '../src/rides.js'
import { SenderStore } from '../src/senders.js'
import { GroupsSync, RideSync } from '../src/sync.js'
import { AIRPORT } from '../src/parser/rules.js'
import { silentLogger } from '../src/logger.js'

const HOUR = 3_600_000
const T0 = 1_759_500_000_000

function setup(rideCount: number, opts: { qr?: boolean } = {}) {
  const db = openDb(':memory:')
  const messages = new MessageStore(db, { duplicateWindowMs: 24 * HOUR, maxContentLength: 4000, retentionMs: 7 * 24 * HOUR })
  let t = T0
  const rides = new RideStore(db, { expireAfterPickupMs: 30 * 60_000, expireWithoutTimeMs: 3 * HOUR, now: () => t })
  messages.save({ group_id: 'g1', group_name: 'Taxi Nội Bài', msg_id: 'm1', sender_uid: '111', sender_name: 'Đức', content: 'x', sent_at: T0 }, 'acc1')
  const senders = new SenderStore(db)
  // Chỉ cuốc của người bắn đã có mã QR mới được gửi (quyết định GreenCA A5).
  if (opts.qr !== false) senders.saveQr('111', 'code1', 'ok', 0)
  const source = { messageId: messages.findId('g1', 'm1')!, senderUid: '111', groupId: 'g1', sentAt: T0 }
  for (let i = 0; i < rideCount; i++) {
    rides.upsertDrafts(source, [{ direction: 'to_airport', pickup: `điểm ${i}`, destination: AIRPORT, pickupAt: T0 + HOUR, pickupTimeText: '5h', seats: null, vehicleNote: null, price: null, isFree: false, rawText: 'x' }])
  }
  return { db, rides, senders, now: () => t, tick: (ms: number) => { t += ms } }
}

test('sends batches of at most 100 until the outbox is empty', async () => {
  const { rides } = setup(150)
  const sizes: number[] = []
  const sync = new RideSync({ rides, send: async (_p, payload) => { sizes.push((payload as { rides: unknown[] }).rides.length); return { status: 200 } }, batchSize: 100, logger: silentLogger, now: () => T0 })
  await sync.flush()
  assert.deepEqual(sizes, [100, 50])
  assert.equal(rides.backlog(), 0)
})

test('keeps rides when Laravel fails and resends them later', async () => {
  const { rides } = setup(3)
  let status = 503
  let t = T0
  const sync = new RideSync({ rides, send: async () => ({ status }), batchSize: 100, logger: silentLogger, now: () => t })
  await sync.flush()
  assert.equal(rides.backlog(), 3)
  status = 200
  await sync.flush() // vẫn trong thời gian chờ
  assert.equal(rides.backlog(), 3)
  t += 1000
  await sync.flush()
  assert.equal(rides.backlog(), 0)
})

test('a ride updated after sync is sent again', async () => {
  const { rides, now, tick } = setup(1)
  const sent: { ride_uid: string; qr_code: string }[] = []
  const sync = new RideSync({ rides, send: async (_p, payload) => { sent.push(...(payload as { rides: { ride_uid: string; qr_code: string }[] }).rides); return { status: 200 } }, batchSize: 100, logger: silentLogger, now })
  await sync.flush()
  tick(1000)
  rides.markSenderChanged('111')
  await sync.flush()
  assert.equal(sent.length, 2)
  assert.equal(sent[0].ride_uid, sent[1].ride_uid)
  assert.equal(sent[0].qr_code, 'code1')
})

test('rides of a sender without a QR code are not sent', async () => {
  const { rides, senders, now, tick } = setup(1, { qr: false })
  const sent: { ride_uid: string; qr_code: string }[] = []
  const sync = new RideSync({ rides, send: async (_p, payload) => { sent.push(...(payload as { rides: { ride_uid: string; qr_code: string }[] }).rides); return { status: 200 } }, batchSize: 100, logger: silentLogger, now })
  await sync.flush()
  assert.equal(sent.length, 0)

  tick(1000)
  senders.saveQr('111', 'code1', 'ok', T0 + 1000)
  rides.markSenderChanged('111')
  await sync.flush()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].qr_code, 'code1')
})

test('flush terminates when rides keep looking changed (sync clock behind the store clock)', async () => {
  const { rides, tick } = setup(1)
  let calls = 0
  const sync = new RideSync({ rides, send: async () => { calls++; return { status: 200 } }, batchSize: 100, logger: silentLogger, now: () => T0 })
  await sync.flush()
  tick(1000)
  rides.markSenderChanged('111') // updated_at = T0 + 1000 > synced_at = T0 mãi mãi
  await sync.flush()
  assert.equal(calls, 2)
})

test('groups sync sends names and 24h counts', async () => {
  const { db } = setup(0)
  let payload: unknown
  const sync = new GroupsSync({ db, send: async (_p, body) => { payload = body; return { status: 200 } }, logger: silentLogger, now: () => T0 + 1000 })
  await sync.flush()
  assert.deepEqual(payload, { groups: [{ zalo_group_id: 'g1', name: 'Taxi Nội Bài', last_message_at: T0, messages_24h: 1 }] })
})
