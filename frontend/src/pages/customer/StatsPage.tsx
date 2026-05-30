import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js'
import { getBookingHistory } from '@/api/bookings'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'
import dayjs from 'dayjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const FILTERS = [
  { key: 'week',  label: '7 ngày'    },
  { key: 'month', label: 'Tháng này' },
  { key: 'all',   label: 'Tất cả'    },
] as const

type Filter = typeof FILTERS[number]['key']

function filterBookings(bookings: App.Booking[], filter: Filter): App.Booking[] {
  const now = dayjs()
  return bookings.filter((b) => {
    const d = dayjs(b.date)
    if (filter === 'week')  return d.isAfter(now.subtract(7, 'day').startOf('day'))
    if (filter === 'month') return d.isSame(now, 'month')
    return true
  })
}

function buildChartPoints(bookings: App.Booking[], filter: Filter) {
  const now = dayjs()
  const completed = bookings.filter((b) => b.status === 'completed')

  if (filter === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const date = now.subtract(6 - i, 'day').format('YYYY-MM-DD')
      const val = completed.filter((b) => b.date === date)
        .reduce((s, b) => s + (b.final_price ?? b.price), 0)
      return { label: now.subtract(6 - i, 'day').format('DD/MM'), value: val / 1000 }
    })
  }

  if (filter === 'month') {
    const daysCount = now.date()
    const startOfMonth = now.startOf('month')
    return Array.from({ length: daysCount }, (_, i) => {
      const date = startOfMonth.add(i, 'day').format('YYYY-MM-DD')
      const val = completed.filter((b) => b.date === date)
        .reduce((s, b) => s + (b.final_price ?? b.price), 0)
      return { label: startOfMonth.add(i, 'day').format('DD/MM'), value: val / 1000 }
    })
  }

  // 'all' — last 6 months (monthly)
  return Array.from({ length: 6 }, (_, i) => {
    const month = now.subtract(5 - i, 'month')
    const val = completed
      .filter((b) => dayjs(b.date).isSame(month, 'month'))
      .reduce((s, b) => s + (b.final_price ?? b.price), 0)
    return { label: month.format('MM/YY'), value: val / 1000 }
  })
}

export default function CustomerStatsPage() {
  const [filter, setFilter] = useState<Filter>('month')

  const { data: allBookings = [], isLoading } = useQuery({
    queryKey: ['bookings', ''],
    queryFn: () => getBookingHistory().then((r) => r.data),
    staleTime: 60_000,
  })

  const bookings   = filterBookings(allBookings, filter)
  const completed  = bookings.filter((b) => b.status === 'completed')
  const cancelled  = bookings.filter((b) => b.status === 'cancelled')
  const totalSpent = completed.reduce((s, b) => s + (b.final_price ?? b.price), 0)
  const totalSaved = bookings.reduce((s, b) => s + (b.discount ?? 0), 0)
  const points     = buildChartPoints(allBookings, filter)
  const hasData    = points.some((p) => p.value > 0)

  const chartData = {
    labels: points.map((p) => p.label),
    datasets: [{
      data: points.map((p) => p.value),
      backgroundColor: '#006a36',
      borderRadius: 4,
      borderSkipped: false,
    }],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      callbacks: { label: (ctx: { parsed: { y: number } }) => `${(ctx.parsed.y).toFixed(0)}k đ` },
    }},
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94A3B8', maxRotation: 45 } },
      y: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 10 }, color: '#94A3B8',
        callback: (v: number | string) => `${v}k` } },
    },
  }

  return (
    <div className="w-full flex flex-col pb-6">
      {/* Filter */}
      <div className="bg-white px-4 pt-3 pb-0 border-b border-border-soft">
        <div className="flex gap-2 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                filter === f.key ? 'bg-primary text-white' : 'bg-primary-tint text-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 flex flex-col gap-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Hoàn thành',       value: completed.length,                    unit: 'chuyến',  color: 'text-primary' },
            { label: 'Đã huỷ',           value: cancelled.length,                    unit: 'chuyến',  color: 'text-danger-red' },
            { label: 'Tổng chi tiêu',    value: totalSpent.toLocaleString('vi'),     unit: 'đ',       color: 'text-primary' },
            { label: 'Tiết kiệm voucher',value: totalSaved > 0 ? totalSaved.toLocaleString('vi') : '0', unit: 'đ', color: 'text-success-green' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="bg-white rounded-card shadow-card border border-border-soft p-4">
              <p className="text-[11px] text-neutral-gray mb-1.5">{label}</p>
              <p className={clsx('text-[20px] font-bold tabular-nums leading-tight', color)}>{value}</p>
              {unit && <p className="text-[11px] text-neutral-gray mt-0.5">{unit}</p>}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-card shadow-card border border-border-soft p-4">
          <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-3">
            {filter === 'all' ? 'Chi tiêu 6 tháng gần nhất (nghìn đ)' : 'Chi tiêu theo ngày (nghìn đ)'}
          </p>
          {isLoading ? (
            <div className="h-[180px] flex items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          ) : !hasData ? (
            <div className="h-[180px] flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-neutral-dim text-4xl">bar_chart</span>
              <p className="text-sm text-neutral-gray">Chưa có chuyến hoàn thành trong kỳ này</p>
            </div>
          ) : (
            <div style={{ height: 180 }}>
              <Bar data={chartData} options={chartOptions as never} />
            </div>
          )}
        </div>

        {!isLoading && bookings.length === 0 && (
          <EmptyState
            icon="bar_chart"
            title="Chưa có dữ liệu"
            description="Đặt và hoàn thành chuyến xe để xem thống kê"
          />
        )}
      </div>
    </div>
  )
}
