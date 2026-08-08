import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js'
import { getCustomerStats, type StatsPeriod } from '@/api/stats'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const FILTERS = [
  { key: 'week',  label: '7 ngày'    },
  { key: 'month', label: 'Tháng này' },
  { key: 'all',   label: 'Tất cả'    },
] as const

type Filter = StatsPeriod

export default function CustomerStatsPage() {
  const [filter, setFilter] = useState<Filter>('month')

  // Backend trả về số liệu đã tính sẵn. Trước đây trang này tải toàn bộ chuyến
  // của khách rồi filter/reduce ở đây — không scale khi khách đi nhiều chuyến.
  const { data: stats, isLoading } = useQuery({
    queryKey: ['customer-stats', filter],
    queryFn: () => getCustomerStats(filter).then((r) => r.data),
    staleTime: 60_000,
  })

  const completedCount = stats?.completed ?? 0
  const cancelledCount = stats?.cancelled ?? 0
  const totalSpent     = stats?.total_spent ?? 0
  const totalSaved     = stats?.total_saved ?? 0
  const points         = stats?.points ?? []
  const hasData        = points.some((p) => p.value > 0)

  const chartData = {
    labels: points.map((p) => p.label),
    datasets: [{
      // Trục Y hiển thị theo nghìn đồng — backend trả VND nguyên
      data: points.map((p) => p.value / 1000),
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
            { label: 'Hoàn thành',       value: completedCount,                      unit: 'chuyến',  color: 'text-primary' },
            { label: 'Đã huỷ',           value: cancelledCount,                      unit: 'chuyến',  color: 'text-danger-red' },
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

        {!isLoading && completedCount === 0 && cancelledCount === 0 && (
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
