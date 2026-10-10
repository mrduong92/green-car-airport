import clsx from 'clsx'
import { useEffect, useState } from 'react'

const DIRECTIONS: { value?: App.FreeRideDirection; label: string }[] = [
  { label: 'Tất cả' },
  { value: 'to_airport', label: 'Tiễn sân bay' },
  { value: 'from_airport', label: 'Đón sân bay' },
  { value: 'other', label: 'Khác' },
]
const WINDOWS: { value?: App.FreeRideFilters['window']; label: string }[] = [
  { label: 'Mọi giờ' },
  { value: '2h', label: '2 giờ tới' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'tomorrow', label: 'Ngày mai' },
]
const SEATS = [4, 5, 7, 16]

interface Props {
  value: App.FreeRideFilters
  onChange: (next: App.FreeRideFilters) => void
}

const chip = (active: boolean) =>
  clsx('rounded-pill px-3 min-h-[36px] text-[13px] font-medium whitespace-nowrap transition-colors',
    active ? 'bg-primary text-white' : 'bg-light-green text-primary')

export default function FreeRideFilters({ value, onChange }: Props) {
  const [q, setQ] = useState(value.q ?? '')
  // "Lọc thêm" (hiện tại chỉ có Số chỗ) ẩn mặc định để hàng chip chính (chiều/khung giờ) không bị
  // chật — nhưng tự mở sẵn nếu đã có bộ lọc số chỗ từ trước (khôi phục từ localStorage) để tài xế
  // thấy ngay vì sao danh sách đang bị lọc, thay vì phải đoán ra có bộ lọc ẩn.
  const [showMore, setShowMore] = useState(() => value.seats != null)
  const extraFilterCount = value.seats != null ? 1 : 0

  // Gõ tìm kiếm: chờ 400ms mới lọc để không gọi API mỗi phím.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q: q || undefined })
    }, 400)
    return () => clearTimeout(t)
  }, [q, value, onChange])

  return (
    <div className="bg-white px-4 pt-3 pb-2 border-b border-border-gray flex flex-col gap-2">
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm địa điểm (vd: Hà Đông, T2...)"
        className="border border-border-gray rounded-input px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DIRECTIONS.map((d) => (
          <button key={d.label} type="button" className={chip(value.direction === d.value)} onClick={() => onChange({ ...value, direction: d.value })}>{d.label}</button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {WINDOWS.map((w) => (
          <button key={w.label} type="button" className={chip(value.window === w.value)} onClick={() => onChange({ ...value, window: w.value })}>{w.label}</button>
        ))}
        <button
          type="button"
          data-testid="free-filters-more-toggle"
          aria-expanded={showMore}
          onClick={() => setShowMore((s) => !s)}
          className={clsx(chip(extraFilterCount > 0), 'shrink-0 flex items-center gap-1')}
        >
          Lọc thêm
          {extraFilterCount > 0 && (
            <span
              className={clsx(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill text-[11px] font-semibold leading-none',
                value.seats != null ? 'bg-white text-primary' : 'bg-primary text-white',
              )}
            >
              {extraFilterCount}
            </span>
          )}
          <span className="material-symbols-outlined text-[16px] leading-none">{showMore ? 'expand_less' : 'expand_more'}</span>
        </button>
      </div>
      {showMore && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="free-filters-more">
          <span className="text-[12px] text-neutral-gray shrink-0">Số chỗ</span>
          {SEATS.map((s) => (
            <button key={s} type="button" className={chip(value.seats === s)} onClick={() => onChange({ ...value, seats: value.seats === s ? undefined : s })}>{s} chỗ</button>
          ))}
        </div>
      )}
    </div>
  )
}
