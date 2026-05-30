import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import { getRevenue } from '@/api/admin'
import clsx from 'clsx'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const PERIODS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week',  label: '7 ngày'  },
  { key: 'month', label: 'Tháng này' },
]

const VEHICLE_ICONS: Record<string, string> = {
  sedan_4: 'directions_car',
  suv_5:   'directions_car',
  mpv_7:   'airport_shuttle',
}

const MEDAL = ['🥇', '🥈', '🥉', '4', '5']

function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return null
  const up = value > 0
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
      up ? 'bg-emerald-50 text-success-green' : 'bg-red-50 text-danger-red',
    )}>
      <span className="material-symbols-outlined text-[12px]">
        {up ? 'trending_up' : 'trending_down'}
      </span>
      {up ? '+' : ''}{value}%
    </span>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi')
}

export default function RevenuePage() {
  const [period, setPeriod] = useState('week')

  const { data, isLoading } = useQuery({
    queryKey: ['revenue', period],
    queryFn: () => getRevenue({ period }).then((r) => r.data),
  })

  const chartData = {
    labels: data?.chart?.map((c) => c.label) ?? [],
    datasets: [
      {
        label: 'Doanh thu',
        data: data?.chart?.map((c) => c.revenue / 1000) ?? [],
        backgroundColor: '#006a36',
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: 'Phí app',
        data: data?.chart?.map((c) => c.fee / 1000) ?? [],
        backgroundColor: '#C8A24A',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }

  const maxVehicleRevenue = Math.max(...(data?.vehicle_breakdown?.map((v) => v.revenue) ?? [1]))

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">

      {/* Period tabs */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={clsx(
              'rounded-pill px-4 py-2 text-sm font-medium transition-colors',
              period === p.key ? 'bg-primary text-white' : 'bg-white text-neutral-gray shadow-card',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: 'Tổng doanh thu',
            value: data ? `${fmt(data.total_revenue)} đ` : '—',
            icon: 'payments',
            change: data?.revenue_change,
            accent: 'text-primary',
          },
          {
            label: 'Phí app (20%)',
            value: data ? `${fmt(data.app_fee)} đ` : '—',
            icon: 'confirmation_number',
            change: data?.revenue_change,
            accent: 'text-gold',
          },
          {
            label: 'Cuốc hoàn thành',
            value: data?.trips_completed.toString() ?? '—',
            icon: 'check_circle',
            change: data?.trips_change,
            accent: 'text-success-green',
          },
          {
            label: 'Trung bình / cuốc',
            value: data ? `${data.avg_per_trip.toLocaleString('vi')} đ` : '—',
            icon: 'trending_up',
            change: undefined,
            accent: 'text-navy',
          },
        ].map(({ label, value, icon, change, accent }) => (
          <div key={label} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
              {change !== undefined && <ChangeBadge value={change} />}
            </div>
            <p className={clsx('text-[18px] font-bold tabular-nums', accent)}>{value}</p>
            <p className="text-[11px] text-neutral-gray mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-card shadow-card p-4">
        <p className="text-[13px] font-semibold text-navy mb-3">Biểu đồ doanh thu</p>
        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        ) : data?.chart?.length ? (
          <Bar
            data={chartData}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => ` ${(ctx.raw as number).toLocaleString('vi')}K đ`,
                  },
                },
              },
              scales: {
                y: {
                  ticks: { callback: (v) => `${v}K`, font: { size: 10 } },
                  grid: { color: '#f0f0f0' },
                },
                x: { ticks: { font: { size: 10 } } },
              },
            }}
          />
        ) : (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-neutral-dim text-4xl">bar_chart</span>
            <p className="text-sm text-neutral-gray">Chưa có dữ liệu trong kỳ này</p>
          </div>
        )}
      </div>

      {/* Vehicle breakdown */}
      {(data?.vehicle_breakdown?.length ?? 0) > 0 && (
        <div className="bg-white rounded-card shadow-card p-4">
          <p className="text-[13px] font-semibold text-navy mb-3">Theo loại xe</p>
          <div className="flex flex-col gap-3">
            {data!.vehicle_breakdown.map((v) => (
              <div key={v.type}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[15px]">
                      {VEHICLE_ICONS[v.type] ?? 'directions_car'}
                    </span>
                    <span className="text-[13px] text-navy font-medium">{v.label}</span>
                    <span className="text-[11px] text-neutral-gray">· {v.trips} cuốc</span>
                  </div>
                  <span className="text-[13px] font-bold text-primary tabular-nums">
                    {fmt(v.revenue)} đ
                  </span>
                </div>
                <div className="h-2 bg-border-gray rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${(v.revenue / maxVehicleRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top drivers */}
      {(data?.top_drivers?.length ?? 0) > 0 && (
        <div className="bg-white rounded-card shadow-card p-4">
          <p className="text-[13px] font-semibold text-navy mb-3">Top tài xế</p>
          <div className="flex flex-col gap-2.5">
            {data!.top_drivers.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-[16px] w-6 text-center shrink-0">
                  {i < 3 ? MEDAL[i] : <span className="text-[12px] text-neutral-gray font-bold">{i + 1}</span>}
                </span>
                <div className="w-9 h-9 rounded-full bg-primary-tint flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {d.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-navy truncate">{d.name}</p>
                  <p className="text-[11px] text-neutral-gray">{d.trips} cuốc</p>
                </div>
                <span className="text-[13px] font-bold text-success-green tabular-nums shrink-0">
                  {fmt(d.revenue)} đ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent completed trips */}
      {(data?.recent_trips?.length ?? 0) > 0 && (
        <div className="bg-white rounded-card shadow-card p-4">
          <p className="text-[13px] font-semibold text-navy mb-3">Cuốc gần đây</p>
          <div className="flex flex-col divide-y divide-border-gray">
            {data!.recent_trips.map((t) => (
              <div key={t.id} className="py-2.5 flex items-start gap-3">
                {/* Date column */}
                <div className="shrink-0 w-10 text-center">
                  <p className="text-[13px] font-bold text-navy leading-tight">{t.date.slice(8)}</p>
                  <p className="text-[10px] text-neutral-gray">{t.date.slice(5, 7)}/{t.date.slice(0, 4).slice(-2)}</p>
                </div>
                {/* Route */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-navy truncate">
                    <span className="text-neutral-gray">↑</span> {t.pickup}
                  </p>
                  <p className="text-[12px] text-navy truncate">
                    <span className="text-gold">↓</span> {t.destination}
                  </p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">
                    {t.driver_name} · {t.customer_name}
                  </p>
                </div>
                {/* Price */}
                <span className="text-[13px] font-bold text-primary tabular-nums shrink-0">
                  {t.price.toLocaleString('vi')} đ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
