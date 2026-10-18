import { useSearchParams } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'

export type DateGroup = 'day' | 'week' | 'month'

export const DATE_FMT = 'YYYY-MM-DD'
export const MAX_RANGE_DAYS = 366

function mondayOf(d: Dayjs): Dayjs {
  const dow = d.day() // 0=CN..6=Th7
  return d.subtract(dow === 0 ? 6 : dow - 1, 'day')
}

export function autoGroup(from: string, to: string): DateGroup {
  const days = dayjs(to).diff(dayjs(from), 'day') + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

export type PresetKey = 'today' | 'yesterday' | '7d' | 'this_week' | 'this_month' | '30d' | 'last_month'

export const PRESETS: { key: PresetKey; label: string; range: () => { from: string; to: string } }[] = [
  {
    key: 'today', label: 'Hôm nay',
    range: () => { const d = dayjs().format(DATE_FMT); return { from: d, to: d } },
  },
  {
    key: 'yesterday', label: 'Hôm qua',
    range: () => { const d = dayjs().subtract(1, 'day').format(DATE_FMT); return { from: d, to: d } },
  },
  {
    key: '7d', label: '7 ngày',
    range: () => ({ from: dayjs().subtract(6, 'day').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'this_week', label: 'Tuần này',
    range: () => ({ from: mondayOf(dayjs()).format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'this_month', label: 'Tháng này',
    range: () => ({ from: dayjs().startOf('month').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: '30d', label: '30 ngày gần nhất',
    range: () => ({ from: dayjs().subtract(29, 'day').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'last_month', label: 'Tháng trước',
    range: () => {
      const m = dayjs().subtract(1, 'month')
      return { from: m.startOf('month').format(DATE_FMT), to: m.endOf('month').format(DATE_FMT) }
    },
  },
]

export interface DateRangeParams {
  from: string
  to: string
  group: DateGroup
  setFilters: (next: { from?: string; to?: string; group?: DateGroup }) => void
  applyPreset: (key: PresetKey) => void
  activePresetKey: PresetKey | undefined
  /** Thông báo lỗi khoảng ngày (null = hợp lệ) — dùng để tắt query khi khoảng sai. */
  rangeError: string | null
}

/**
 * Bộ lọc khoảng ngày lưu trên URL (?from=&to=&group=). Chưa có tham số → khoảng của preset
 * mặc định; group chỉ nhận week|month, còn lại là day.
 */
export function useDateRangeParams(defaultPreset: PresetKey = '30d'): DateRangeParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const def = PRESETS.find((p) => p.key === defaultPreset)!.range()
  const from = searchParams.get('from') ?? def.from
  const to = searchParams.get('to') ?? def.to
  const rawGroup = searchParams.get('group')
  const group: DateGroup = rawGroup === 'week' || rawGroup === 'month'
    ? rawGroup
    : searchParams.has('from') || searchParams.has('to') ? 'day' : autoGroup(def.from, def.to)

  const setFilters: DateRangeParams['setFilters'] = (next) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('from', next.from ?? from)
      params.set('to', next.to ?? to)
      params.set('group', next.group ?? group)
      return params
    }, { replace: true })
  }

  const applyPreset = (key: PresetKey) => {
    const preset = PRESETS.find((p) => p.key === key)
    if (!preset) return
    const { from: f, to: t } = preset.range()
    setFilters({ from: f, to: t, group: autoGroup(f, t) })
  }

  const activePresetKey = PRESETS.find((p) => {
    const r = p.range()
    return r.from === from && r.to === to
  })?.key

  const rangeDays = dayjs(to).diff(dayjs(from), 'day') + 1
  const rangeError = Number.isNaN(dayjs(from).valueOf()) || Number.isNaN(dayjs(to).valueOf())
    ? 'Ngày không hợp lệ.'
    : dayjs(to).isBefore(dayjs(from))
      ? '"Đến ngày" phải sau hoặc bằng "Từ ngày".'
      : rangeDays > MAX_RANGE_DAYS
        ? 'Khoảng thời gian tối đa là 366 ngày.'
        : null

  return { from, to, group, setFilters, applyPreset, activePresetKey, rangeError }
}
