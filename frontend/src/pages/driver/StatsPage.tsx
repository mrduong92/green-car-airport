import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js'
import { getTripHistory } from '@/api/trips'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'
import dayjs from 'dayjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const FILTERS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week',  label: '7 ngày'  },
  { key: 'month', label: 'Tháng này' },
] as const

type Filter = typeof FILTERS[number]['key']

function filterTrips(trips: App.Trip[], filter: Filter): App.Trip[] {
  const now = dayjs()
  return trips.filter((t) => {
    const d = dayjs(t.date)
    if (filter === 'today') return d.isSame(now, 'day')
    if (filter === 'week')  return d.isAfter(now.subtract(7, 'day').startOf('day'))
    return d.isSame(now, 'month')
  })
}

function buildChartPoints(trips: App.Trip[], filter: Filter) {
  const now = dayjs()

  if (filter === 'today') {
    const hours = Array.from({ length: 8 }, (_, i) => i * 3)
    return hours.map((h) => {
      const val = trips
        .filter((t) => {
          const tripHour = parseInt(t.time.slice(0, 2), 10)
          return tripHour >= h && tripHour < h + 3
        })
        .reduce((s, t) => s + t.net_earning, 0)
      return { label: `${String(h).padStart(2, '0')}h`, value: val / 1000 }
    })
  }

  if (filter === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const date = now.subtract(6 - i, 'day').format('YYYY-MM-DD')
      const val = trips
        .filter((t) => t.date === date)
        .reduce((s, t) => s + t.net_earning, 0)
      return { label: now.subtract(6 - i, 'day').format('DD/MM'), value: val / 1000 }
    })
  }

  // month — from day 1 to today
  const daysCount = now.date()
  const startOfMonth = now.startOf('month')
  return Array.from({ length: daysCount }, (_, i) => {
    const date = startOfMonth.add(i, 'day').format('YYYY-MM-DD')
    const val = trips
      .filter((t) => t.date === date)
      .reduce((s, t) => s + t.net_earning, 0)
    return { label: startOfMonth.add(i, 'day').format('DD/MM'), value: val / 1000 }
  })
}

export default function DriverStatsPage() {
  const [filter, setFilter] = useState<Filter>('week')

  const { data: allTrips = [], isLoading } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => getTripHistory().then((r) => r.data),
    staleTime: 60_000,
  })

  const trips  = filterTrips(allTrips, filter)
  const total  = trips.reduce((s, t) => s + t.net_earning, 0)
  const avgPer = trips.length > 0 ? Math.round(total / trips.length) : null
  const totalKm = trips.reduce((s, t) => s + t.distance_km, 0)
  const points = buildChartPoints(trips, filter)
  const hasData = points.some((p) => p.value > 0)

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
            { label: 'Số cuốc',      value: trips.length,                          unit: 'chuyến', color: 'text-primary' },
            { label: 'Thu nhập',     value: total.toLocaleString('vi'),             unit: 'đ',      color: 'text-success-green' },
            { label: 'Trung bình',   value: avgPer ? avgPer.toLocaleString('vi') : '—', unit: avgPer ? 'đ/cuốc' : '', color: 'text-primary' },
            { label: 'Tổng km',      value: totalKm.toFixed(1),                    unit: 'km',     color: 'text-primary' },
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
            Thu nhập theo ngày (nghìn đ)
          </p>
          {isLoading ? (
            <div className="h-[180px] flex items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
          ) : !hasData ? (
            <div className="h-[180px] flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-neutral-dim text-4xl">bar_chart</span>
              <p className="text-sm text-neutral-gray">Chưa có dữ liệu trong kỳ này</p>
            </div>
          ) : (
            <div style={{ height: 180 }}>
              <Bar data={chartData} options={chartOptions as never} />
            </div>
          )}
        </div>

        {/* Empty state full page */}
        {!isLoading && trips.length === 0 && (
          <EmptyState
            icon="bar_chart"
            title="Chưa có chuyến nào"
            description="Hoàn thành chuyến xe để xem thống kê"
          />
        )}
      </div>
    </div>
  )
}
