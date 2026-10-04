import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIRPORT, parseRides, type RideDraft } from '../src/parser/rules.js'

const VN = 7 * 3_600_000
const vn = (ms: number | null) => (ms === null ? null : new Date(ms + VN).toISOString().slice(0, 16).replace('T', ' '))
const SENT = Date.parse('2026-10-04T01:30:00Z') - VN // 01:30 ngày 04/10 giờ VN

function pick(r: RideDraft) {
  return {
    direction: r.direction, pickup: r.pickup, destination: r.destination, at: vn(r.pickupAt),
    time: r.pickupTimeText, seats: r.seats, vehicle: r.vehicleNote, price: r.price, free: r.isFree,
  }
}

function rides(content: string) {
  const out = parseRides(content, SENT)
  assert.equal(out.kind, 'rides', `mong đợi rides, nhận ${out.kind} cho: ${content}`)
  return (out as { kind: 'rides'; rides: RideDraft[] }).rides.map(pick)
}

test('tiễn with commission tokens', () => {
  assert.deepEqual(rides('tiễn 4h15 phố cổ ck 200 0.25'), [
    { direction: 'to_airport', pickup: 'phố cổ', destination: AIRPORT, at: '2026-10-04 04:15', time: '4h15', seats: null, vehicle: null, price: null, free: false },
  ])
})

test('splits a two-ride message into two rides, inheriting free flag and direction', () => {
  assert.deepEqual(rides('Feee\n4/10  Tiễn  6h45 _  40 Tương Mai  , ko thu ck230\n\n 4/10 _7h00_  50 Nguyễn Chí Thanh , ko thu ck200'), [
    { direction: 'to_airport', pickup: '40 Tương Mai', destination: AIRPORT, at: '2026-10-04 06:45', time: '6h45', seats: null, vehicle: null, price: 230000, free: true },
    { direction: 'to_airport', pickup: '50 Nguyễn Chí Thanh', destination: AIRPORT, at: '2026-10-04 07:00', time: '7h00', seats: null, vehicle: null, price: 200000, free: true },
  ])
})

test('table-like rows with seats and formatted prices', () => {
  assert.deepEqual(rides('4h30     Tiễn      khu đất dịch vụ xã hoài đức          280,000đ       xe 5       TK 0.25\n\n4h45     Tiễn       r1 swanlake ecopark       250,000đ       xe 5       TK 0.25'), [
    { direction: 'to_airport', pickup: 'khu đất dịch vụ xã hoài đức', destination: AIRPORT, at: '2026-10-04 04:30', time: '4h30', seats: 5, vehicle: null, price: 280000, free: false },
    { direction: 'to_airport', pickup: 'r1 swanlake ecopark', destination: AIRPORT, at: '2026-10-04 04:45', time: '4h45', seats: 5, vehicle: null, price: 250000, free: false },
  ])
})

test('explicit separator, time range, vehicle note, destination cut at comma', () => {
  assert.deepEqual(rides('X7  15-16h Tam Cốc --> Hà Đông 800k, khách có 7 người'), [
    { direction: 'other', pickup: 'Tam Cốc', destination: 'Hà Đông', at: '2026-10-04 15:00', time: '15-16h', seats: null, vehicle: 'x7', price: 800000, free: false },
  ])
})

test('ignores tiny "1k" (one passenger) and uses the real price', () => {
  assert.deepEqual(rides('12h30 1k khánh hội ninh bình - nút giao khánh hoà 150k'), [
    { direction: 'other', pickup: 'khánh hội ninh bình', destination: 'nút giao khánh hoà', at: '2026-10-04 12:30', time: '12h30', seats: null, vehicle: null, price: 150000, free: false },
  ])
})

test('đón at the airport with a separator', () => {
  assert.deepEqual(rides('đón T1 9h về Hà Đông 300k'), [
    { direction: 'from_airport', pickup: `${AIRPORT} (T1)`, destination: 'Hà Đông', at: '2026-10-04 09:00', time: '9h', seats: null, vehicle: null, price: 300000, free: false },
  ])
})

test('ambiguous messages go to AI', () => {
  for (const content of [
    '5h tran nhan tong 200k free CK pl',
    "8h30' tiễn 89 Quan Nhân về Đại Tảo Đa Phúc SS 2c đổ đón tầm 12h30' hẹn khách đón về lại tk600k sdb vf6",
    '0-30p bx vf8 hoặc limo yên vỹ yên phong bn đi kcn quang minh 250k',
    'T1 - trần khát chân 180k freeeeeeee',
  ]) {
    assert.equal(parseRides(content, SENT).kind, 'unsure', content)
  }
})

test('chatter is not a ride', () => {
  for (const content of ['chào cả nhà', 'ae nào ở Hà Đông không', 'ok anh']) {
    assert.equal(parseRides(content, SENT).kind, 'not_ride', content)
  }
})

test('relative-day words ("mai", "mốt"...) are ambiguous, not silently resolved to today', () => {
  for (const content of [
    'mai tiễn 5h Hà Đông 300k',
    'tiễn 5h Hà Đông 300k mốt',
    'tiễn hôm nay 5h Hà Đông 300k',
    'tiễn 5h Hà Đông 300k ngày kia',
  ]) {
    assert.equal(parseRides(content, SENT).kind, 'unsure', content)
  }
})

test('a relative-day word that is really part of a place name is not mistaken for one', () => {
  // "Tương Mai" is a real Hà Nội ward — must stay a ride, not get swept into the "mai" guard.
  assert.deepEqual(rides('tiễn 6h45 40 Tương Mai 230k'), [
    { direction: 'to_airport', pickup: '40 Tương Mai', destination: AIRPORT, at: '2026-10-04 06:45', time: '6h45', seats: null, vehicle: null, price: 230000, free: false },
  ])
})

test('time-of-day words ("chiều", "sáng"...) are ambiguous, not silently resolved to the wrong day', () => {
  for (const content of [
    'tiễn 5h chiều Hà Đông 300k',
    'tiễn 5h sáng Hà Đông 300k',
  ]) {
    assert.equal(parseRides(content, SENT).kind, 'unsure', content)
  }
})

test('phone-like digit runs are ambiguous, not read as price or left in the pickup', () => {
  for (const content of [
    'tiễn 5h Hà Đông 0912.345.678',
    'tiễn 5h Hà Đông lh 091.234.5678',
    // Plain, unseparated 10-digit numbers get the same treatment for consistency.
    'tiễn 5h Hà Đông 0912345678',
  ]) {
    assert.equal(parseRides(content, SENT).kind, 'unsure', content)
  }
})
