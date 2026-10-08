import { findDate, findTimes, resolvePickupAt } from './time.js'
import { truncate } from '../text.js'

export type Direction = 'to_airport' | 'from_airport' | 'other'

export interface RideDraft {
  direction: Direction | null
  pickup: string | null
  destination: string | null
  pickupAt: number | null
  pickupTimeText: string | null
  seats: number | null
  vehicleNote: string | null
  price: number | null
  isFree: boolean
  rawText: string
}

// Giới hạn khớp validate của Laravel (ZaloRideIngestService): giá trị vượt giới hạn làm Laravel loại cả cuốc
// (cuốc mất âm thầm). Chữ quá dài thì cắt; số ngoài khoảng hợp lý thì bỏ (null) — vẫn giữ được cuốc.
export const MAX_SHORT_TEXT = 32
export const MAX_SEATS = 60
export const MAX_PRICE = 100_000_000

export function sanitizeDraft(draft: RideDraft): RideDraft {
  const inRange = (v: number | null, min: number, max: number) => (v !== null && Number.isInteger(v) && v >= min && v <= max ? v : null)
  return {
    ...draft,
    pickupTimeText: draft.pickupTimeText == null ? null : truncate(draft.pickupTimeText, MAX_SHORT_TEXT),
    vehicleNote: draft.vehicleNote == null ? null : truncate(draft.vehicleNote, MAX_SHORT_TEXT),
    seats: inRange(draft.seats, 1, MAX_SEATS),
    price: inRange(draft.price, 0, MAX_PRICE),
  }
}

export type ParseOutcome = { kind: 'rides'; rides: RideDraft[] } | { kind: 'not_ride' } | { kind: 'unsure' }

export const AIRPORT = 'Sân bay Nội Bài'

// Ranh giới từ cho chữ có dấu: \b của JS chỉ hiểu ASCII.
const word = (src: string, flags = 'giu') => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, flags)
// Regex có cờ g giữ lastIndex giữa các lần .test() → luôn kiểm bằng bản không có g.
const has = (re: RegExp, text: string) => new RegExp(re.source, 'iu').test(text)

const TIEN = word('ti[eễ]n')
const DON = word('[đd][oó]n')
const AIRPORT_TOKEN = word('s[aâ]n\\s*bay(?:\\s*n[oộ]i\\s*b[aà]i)?|n[oộ]i\\s*b[aà]i|sb|nb|t[12]')
const AIRPORT_ONLY = /^(?:s[aâ]n\s*bay(?:\s*n[oộ]i\s*b[aà]i)?|n[oộ]i\s*b[aà]i|sb|nb|(t[12]))$/iu
const FREE_CK = word('(?:ko|k|không|khong)\\s+thu\\s+ck\\s*(\\d{2,4})?')
const FREE_WORD = word('f+r*e{2,}|free')
const FEE = word('(?:ck|tk)\\s*\\d[\\d.,]*k?')
const RATE = /(?<![\p{L}\d.,])0[.,]\d{1,2}(?!\d)/gu
const SEATS = [word('xe\\s*(\\d{1,2})'), word('(\\d{1,2})\\s*(?:c|chỗ|cho)')]
const VALID_SEATS = new Set([4, 5, 7, 9, 16, 29, 45])
const VEHICLE = word('limo(?:usine)?|vf\\s?\\d|x7|xl7', 'iu')
const SEPARATOR = /\s*(?:-->|->|=>|→|>|–|—)\s*|\s+-\s+|\s+(?:về|đi|tới|đến)\s+/iu

// Từ ngày/giờ tương đối ("mai", "mốt", "chiều"...) đổi nghĩa giờ đón, nhưng quy tắc không suy luận ngữ
// nghĩa — thấy là nhường cho AI (unsure) thay vì đoán sai. Khớp không phân biệt hoa thường: bàn phím
// điện thoại tự viết hoa chữ đầu câu ("Mai tiễn...", "SÁNG MAI tiễn..."), nên chỉ khớp chữ thường sẽ bỏ
// sót đúng trường hợp hay gặp nhất. Tên địa danh trùng chữ ("Tương Mai", "Mai Dịch"...) được bảo vệ riêng
// bằng danh sách loại trừ bên dưới, không phải bằng cách phân biệt hoa thường.
const RELATIVE_DAY = word('mai|mốt|nay|ngày\\s+kia')
const TIME_OF_DAY = word('sáng|trưa|chiều|tối|đêm')

// Tên địa danh có thật chứa "mai" — xoá tạm các cụm này (chỉ trên bản sao dùng để kiểm tra, không đụng
// vào text gốc) trước khi kiểm RELATIVE_DAY/TIME_OF_DAY, để không nhầm tên riêng với trạng từ chỉ ngày.
const PLACE_NAME_EXCEPTIONS = word('tương\\s+mai|hoàng\\s+mai|mai\\s+dịch|mai\\s+động|mai\\s+lâm')
const blankExceptions = (text: string): string => text.replace(PLACE_NAME_EXCEPTIONS, ' ')

// Số điện thoại (có hoặc không chấm/gạch nối): bắt đầu bằng 0, đủ 9–11 chữ số sau khi bỏ dấu phân cách.
// Thay vì cố lọc số điện thoại ra khỏi text (dễ đọc nhầm thành giá hoặc lẫn vào điểm đón/đến), nhường cả
// đoạn cho AI. Số thường (không chấm) cũng bị loại theo, để hành vi nhất quán.
const PHONE_LIKE = /(?<![\d.-])0(?:[ .-]?\d){8,10}(?![\d.-])/u

// Giá: lấy theo thứ tự, xoá phần đã đọc để không đếm hai lần. Dưới 10.000đ không phải giá ("1k" = 1 khách).
const PRICES: { re: RegExp; read: (m: RegExpMatchArray) => number }[] = [
  { re: word('(\\d{1,3}(?:[.,]\\d{3})+)\\s*(?:đ|vnđ|vnd|d)?'), read: (m) => Number(m[1].replace(/[.,]/g, '')) },
  { re: word('(\\d+)[.,](\\d)\\s*tr(?:i[eệ]u)?'), read: (m) => Number(m[1]) * 1_000_000 + Number(m[2]) * 100_000 },
  { re: word('(\\d+)\\s*tr(?:i[eệ]u)?\\s*(\\d)?'), read: (m) => Number(m[1]) * 1_000_000 + (m[2] ? Number(m[2]) * 100_000 : 0) },
  { re: word('(\\d+)\\s*k'), read: (m) => Number(m[1]) * 1000 },
]

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .split(',')
    .map((part) => part.replace(/^[\s_.\-:;()'"]+|[\s_.\-:;()'"]+$/g, '').trim())
    .find((part) => part.length > 0) ?? ''
}

function normalizePlace(place: string): string {
  const m = AIRPORT_ONLY.exec(place)
  if (!m) return place
  return m[1] ? `${AIRPORT} (${m[1].toUpperCase()})` : AIRPORT
}

function isAirport(place: string): boolean {
  return AIRPORT_ONLY.test(place) || place.startsWith(AIRPORT)
}

function parseSegment(seg: string, header: string, defaultDirection: Direction | null, sentAt: number): RideDraft | null {
  const segChecked = blankExceptions(seg)
  const headerChecked = blankExceptions(header)
  if (
    has(RELATIVE_DAY, segChecked) || has(RELATIVE_DAY, headerChecked) ||
    has(TIME_OF_DAY, segChecked) || has(TIME_OF_DAY, headerChecked) ||
    PHONE_LIKE.test(seg) || PHONE_LIKE.test(header)
  ) return null

  const times = findTimes(seg)
  if (times.length !== 1 || times[0].relative) return null
  const time = times[0]
  const date = findDate(seg) ?? findDate(header)

  let rest = seg
  rest = rest.replace(time.text, ' ')
  if (date && seg.includes(date.text)) rest = rest.replace(date.text, ' ')

  let isFree = has(FREE_WORD, seg) || has(FREE_WORD, header)
  let price: number | null = null
  const freeCk = new RegExp(FREE_CK.source, 'iu').exec(rest) ?? new RegExp(FREE_CK.source, 'iu').exec(header)
  if (freeCk) {
    isFree = true
    if (freeCk[1] && rest.includes(freeCk[0])) price = Number(freeCk[1]) * 1000
    rest = rest.replace(freeCk[0], ' ')
  }
  rest = rest.replace(FEE, ' ').replace(RATE, ' ').replace(FREE_WORD, ' ')

  const prices: number[] = []
  for (const { re, read } of PRICES) {
    rest = rest.replace(re, (...args) => {
      const value = read(args as unknown as RegExpMatchArray)
      if (value >= 10_000) prices.push(value)
      return ' '
    })
  }
  if (price === null) {
    const distinct = [...new Set(prices)]
    price = distinct.length === 1 ? distinct[0] : null
  }

  let seats: number | null = null
  for (const re of SEATS) {
    rest = rest.replace(re, (whole, n: string) => {
      const value = Number(n)
      if (!VALID_SEATS.has(value)) return whole
      seats ??= value
      return ' '
    })
  }
  const vehicle = VEHICLE.exec(rest)
  const vehicleNote = vehicle ? vehicle[0].toLowerCase().replace(/\s+/g, '').replace('limousine', 'limo') : null
  if (vehicle) rest = rest.replace(vehicle[0], ' ')

  const hasTien = has(TIEN, seg)
  const hasDon = has(DON, seg)
  if (hasTien && hasDon) return null
  rest = rest.replace(TIEN, ' ').replace(DON, ' ')

  let direction: Direction | null
  let pickup: string
  let destination: string

  const sep = SEPARATOR.exec(rest)
  if (sep) {
    pickup = normalizePlace(clean(rest.slice(0, sep.index)))
    destination = normalizePlace(clean(rest.slice(sep.index + sep[0].length)))
    direction = isAirport(pickup) ? 'from_airport' : isAirport(destination) ? 'to_airport' : 'other'
  } else {
    const keyword: Direction | null = hasTien ? 'to_airport' : hasDon ? 'from_airport' : defaultDirection
    const place = clean(rest.replace(AIRPORT_TOKEN, ' '))
    if (keyword === 'to_airport') {
      pickup = place
      destination = AIRPORT
    } else if (keyword === 'from_airport' && has(AIRPORT_TOKEN, seg)) {
      pickup = AIRPORT
      destination = place
    } else {
      return null
    }
    direction = keyword
  }

  if (!pickup || !destination) return null

  return sanitizeDraft({
    direction, pickup, destination,
    pickupAt: resolvePickupAt(sentAt, time.hour, time.minute, date?.day, date?.month),
    pickupTimeText: time.text,
    seats, vehicleNote, price, isFree,
    rawText: seg.trim(),
  })
}

export function parseRides(content: string, sentAt: number): ParseOutcome {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  let header = ''
  const segments: string[] = []
  for (const line of lines) {
    if (findTimes(line).length > 0) segments.push(line)
    else if (segments.length > 0) segments[segments.length - 1] += ` ${line}`
    else header += ` ${line}`
  }

  if (segments.length === 0) {
    const hasPrice = PRICES.some(({ re }) => has(re, content))
    return hasPrice ? { kind: 'unsure' } : { kind: 'not_ride' }
  }

  // Chiều mặc định khi cả tin chỉ có một loại từ khoá ("Tiễn" ở dòng đầu, dòng sau không nhắc lại).
  const tien = has(TIEN, content)
  const don = has(DON, content)
  const defaultDirection: Direction | null = tien && !don ? 'to_airport' : null

  const rides: RideDraft[] = []
  for (const seg of segments) {
    const ride = parseSegment(seg, header, defaultDirection, sentAt)
    if (!ride) return { kind: 'unsure' }
    rides.push(ride)
  }
  return { kind: 'rides', rides }
}
