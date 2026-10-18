import clsx from 'clsx'
import { PRESETS, type DateGroup, type DateRangeParams } from '@/hooks/useDateRangeParams'

const GROUPS: { key: DateGroup; label: string }[] = [
  { key: 'day', label: 'Ngày' },
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
]

interface Props {
  range: DateRangeParams
  /** Tiền tố data-testid: `${testIdPrefix}-preset-<key>` / `${testIdPrefix}-group-<key>`. */
  testIdPrefix: string
  className?: string
}

/** Thanh lọc khoảng ngày dùng chung: preset · Từ/Đến ngày · gom Ngày/Tuần/Tháng. */
export default function DateRangeFilter({ range, testIdPrefix, className }: Props) {
  const { from, to, group, setFilters, applyPreset, activePresetKey, rangeError } = range

  return (
    <div className={clsx('bg-white rounded-card shadow-card p-4 flex flex-col gap-3', className)}>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            data-testid={`${testIdPrefix}-preset-${p.key}`}
            onClick={() => applyPreset(p.key)}
            className={clsx(
              'rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap',
              activePresetKey === p.key ? 'bg-primary text-white' : 'bg-light-green text-navy',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-neutral-gray">
          Từ ngày
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFilters({ from: e.target.value })}
            className="rounded-input border border-border-gray px-2 py-1.5 text-sm text-navy outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-neutral-gray">
          Đến ngày
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setFilters({ to: e.target.value })}
            className="rounded-input border border-border-gray px-2 py-1.5 text-sm text-navy outline-none focus:border-primary"
          />
        </label>

        <div className="flex rounded-pill bg-warm-white p-0.5 ml-auto">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              data-testid={`${testIdPrefix}-group-${g.key}`}
              onClick={() => setFilters({ group: g.key })}
              className={clsx(
                'rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors',
                group === g.key ? 'bg-primary text-white' : 'text-neutral-gray',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {rangeError && (
        <p className="text-[12px] text-danger-red">{rangeError}</p>
      )}
    </div>
  )
}
