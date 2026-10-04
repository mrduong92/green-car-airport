// Giờ Việt Nam cố định UTC+7 (không có giờ mùa hè).
const VN_OFFSET_MS = 7 * 3_600_000
const DAY_MS = 24 * 3_600_000

export interface TimeToken {
  hour: number
  minute: number
  text: string
  start: number
  end: number
  relative: boolean
}

// Thứ tự = độ ưu tiên khi trùng vị trí ("15-16h" thắng "16h").
const PATTERNS: { re: RegExp; relative: boolean; read: (m: RegExpExecArray) => [number, number] }[] = [
  { re: /(?<![\d/:])(\d{1,2})\s*-\s*(\d{1,3})\s*(?:phút|ph|p)(?![\p{L}\d])/giu, relative: true, read: (m) => [Number(m[1]), Number(m[2])] },
  { re: /(?<![\d/:])(\d{1,2})\s*-\s*(\d{1,2})\s*h(?![\p{L}\d])/giu, relative: false, read: (m) => [Number(m[1]), 0] },
  { re: /(?<![\d/:])(\d{1,2}):(\d{2})(?!\d)/gu, relative: false, read: (m) => [Number(m[1]), Number(m[2])] },
  { re: /(?<![\d/:\p{L}])(\d{1,2})\s*[hg]\s*(\d{2})?'?(?![\p{L}\d])/giu, relative: false, read: (m) => [Number(m[1]), m[2] ? Number(m[2]) : 0] },
]

export function findTimes(text: string): TimeToken[] {
  const found: TimeToken[] = []
  for (const { re, relative, read } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (found.some((f) => start < f.end && end > f.start)) continue
      const [hour, minute] = read(m as RegExpExecArray)
      if (!relative && (hour > 23 || minute > 59)) continue
      found.push({ hour, minute, text: m[0].trim(), start, end, relative })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

export function findDate(text: string): { day: number; month: number; text: string } | null {
  const m = /(?<![\d:/])(\d{1,2})\/(\d{1,2})(?![\d/])/u.exec(text)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month, text: m[0] }
}

export function resolvePickupAt(sentAt: number, hour: number, minute: number, day?: number | null, month?: number | null): number {
  const local = new Date(sentAt + VN_OFFSET_MS) // getUTC* trên mốc đã cộng 7h = giờ VN
  const year = local.getUTCFullYear()
  const m = month ? month - 1 : local.getUTCMonth()
  const d = day ?? local.getUTCDate()
  let candidate = Date.UTC(year, m, d, hour, minute) - VN_OFFSET_MS

  if (day == null) {
    if (candidate < sentAt - 30 * 60_000) candidate += DAY_MS // giờ đã qua → hôm sau
  } else if (candidate < sentAt - DAY_MS) {
    candidate = Date.UTC(year + 1, m, d, hour, minute) - VN_OFFSET_MS // "2/1" đăng ngày 31/12
  }
  return candidate
}
