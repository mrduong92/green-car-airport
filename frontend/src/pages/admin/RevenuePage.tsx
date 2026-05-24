import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import { getRevenue } from '@/api/admin'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const PERIODS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week',  label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
]

export default function RevenuePage() {
  const [period, setPeriod] = useState('week')

  const { data } = useQuery({
    queryKey: ['revenue', period],
    queryFn: () => getRevenue({ period }).then((r) => r.data),
  })

  const chartData = {
    labels: data?.chart.map((c) => c.label) ?? [],
    datasets: [
      {
        label: 'Doanh thu',
        data: data?.chart.map((c) => c.revenue / 1000) ?? [],
        backgroundColor: '#1E3A8A',
        borderRadius: 6,
      },
      {
        label: 'Phí app',
        data: data?.chart.map((c) => c.fee / 1000) ?? [],
        backgroundColor: '#C8A24A',
        borderRadius: 6,
      },
    ],
  }

  const stats = [
    { label: 'Tổng doanh thu', value: data ? `${(data.total_revenue / 1_000_000).toFixed(1)}M đ` : '—', icon: 'payments' },
    { label: 'Phí app thu được', value: data ? `${(data.app_fee / 1_000_000).toFixed(1)}M đ` : '—', icon: 'confirmation_number' },
    { label: 'Cuốc hoàn thành', value: data?.trips_completed.toString() ?? '—', icon: 'check_circle' },
    { label: 'Trung bình/cuốc', value: data ? `${data.avg_per_trip.toLocaleString('vi')} đ` : '—', icon: 'trending_up' },
  ]

  return (
    <div className="flex flex-col px-4 py-4 gap-4">
      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`rounded-pill px-4 py-2 text-sm font-medium transition-colors
              ${period === p.key ? 'bg-primary text-white' : 'bg-white text-neutral-gray shadow-card'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-card shadow-card p-4">
        {data?.chart.length ? (
          <Bar data={chartData} options={{
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
            scales: {
              y: { ticks: { callback: (v) => `${v}K` }, grid: { color: '#f0f0f0' } },
            },
          }} />
        ) : (
          <div className="h-40 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon }) => (
          <div key={label} className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-1 mb-2">
              <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
              <span className="text-caption text-neutral-gray">{label}</span>
            </div>
            <p className="text-lg font-bold text-navy">{value}</p>
          </div>
        ))}
      </div>

      {/* Export */}
      <button className="flex items-center justify-center gap-2 bg-white rounded-card shadow-card py-4 text-sm font-medium text-navy">
        <span className="material-symbols-outlined text-primary">download</span>
        Xuất Excel
      </button>
    </div>
  )
}
