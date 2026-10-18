import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import clsx from 'clsx'
import { getCustomerStats, type CustomerStats } from '@/api/stats'
import { getReferrals } from '@/api/rewards'
import EmptyState from '@/components/common/EmptyState'
import DateRangeFilter from '@/components/common/DateRangeFilter'
import { useDateRangeParams } from '@/hooks/useDateRangeParams'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const COLORS = {
  primary: '#006a36',
  danger: '#EF4444',
  gold: '#D4AF37',
  success: '#10B981',
}

const baseScales = (stacked: boolean) => ({
  x: { stacked, grid: { display: false }, ticks: { font: { size: 10 }, color: '#94A3B8', maxRotation: 45 } },
  y: { stacked, beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { precision: 0, font: { size: 10 }, color: '#94A3B8' } },
})

interface ChartCardProps {
  testId: string
  title: string
  loading: boolean
  empty: boolean
  chartKey: string
  data: { labels: string[]; datasets: object[] }
  stacked?: boolean
  legend?: boolean
  tooltipLabel?: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => string
  yTick?: (v: number | string) => string
}

function ChartCard({ testId, title, loading, empty, chartKey, data, stacked = false, legend = false, tooltipLabel, yTick }: ChartCardProps) {
  const scales = baseScales(stacked)
  if (yTick) (scales.y.ticks as Record<string, unknown>).callback = yTick

  return (
    <div data-testid={testId} className="bg-white rounded-card shadow-card border border-border-soft p-4">
      <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-3">{title}</p>
      {loading ? (
        <div className="h-[180px] flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
        </div>
      ) : empty ? (
        <div className="h-[180px] flex flex-col items-center justify-center gap-2">
          <span className="material-symbols-outlined text-neutral-dim text-4xl">bar_chart</span>
          <p className="text-sm text-neutral-gray text-center">Chưa có dữ liệu trong khoảng này</p>
        </div>
      ) : (
        <div className="h-[180px]">
          {/* key: vẽ lại từ đầu khi đổi khoảng/kiểu gom — tránh cột cũ "trượt" sang số mốc mới */}
          <Bar
            key={chartKey}
            data={data as never}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: legend ? { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } : { display: false },
                tooltip: tooltipLabel ? { callbacks: { label: tooltipLabel as never } } : {},
              },
              scales: scales as never,
            }}
          />
        </div>
      )}
    </div>
  )
}

const fmtVnd = (n: number) => n.toLocaleString('vi-VN')

export default function CustomerStatsPage() {
  const range = useDateRangeParams('this_month')
  const { from, to, group, rangeError } = range

  // Backend trả về số liệu đã tính sẵn (SQL aggregate), không tải toàn bộ chuyến về filter ở đây.
  const { data: stats, isLoading, isError, refetch } = useQuery<CustomerStats>({
    queryKey: ['customer-stats', from, to, group],
    queryFn: () => getCustomerStats({ from, to, group }).then((r) => r.data),
    staleTime: 60_000,
    enabled: !rangeError,
  })

  // Lối vào trang F1 đặt ở đây cho dễ thấy (trước chỉ nằm trong bottom sheet "Giới thiệu bạn bè" ở Hồ sơ).
  const { data: referrals } = useQuery({
    queryKey: ['customer-referrals-summary'],
    queryFn: () => getReferrals().then((r) => r.data),
  })

  const summary = stats?.summary
  const series = stats?.series ?? []
  const labels = series.map((s) => s.label)
  const chartKey = `${stats?.from}-${stats?.to}-${stats?.group}`
  const loading = isLoading && !rangeError

  const kpis = [
    { label: 'Hoàn thành', value: String(summary?.completed ?? 0), unit: 'chuyến', color: 'text-primary', testId: 'stats-kpi-completed' },
    { label: 'Đã huỷ', value: String(summary?.cancelled ?? 0), unit: 'chuyến', color: 'text-danger-red', testId: 'stats-kpi-cancelled' },
    { label: 'Tổng chi tiêu', value: fmtVnd(summary?.total_spent ?? 0), unit: 'đ', color: 'text-primary', testId: 'stats-kpi-spent' },
    { label: 'Tiết kiệm (voucher + điểm)', value: fmtVnd(summary?.total_saved ?? 0), unit: 'đ', color: 'text-success-green', testId: 'stats-kpi-saved' },
    { label: 'Điểm thưởng nhận được', value: fmtVnd(summary?.reward_points ?? 0), unit: 'điểm', color: 'text-gold', testId: 'stats-kpi-reward' },
  ]

  return (
    <div className="w-full flex flex-col pb-6">
      <div className="px-4 pt-4 flex flex-col gap-4">
        <DateRangeFilter range={range} testIdPrefix="stats" className="border border-border-soft" />

        {isError ? (
          <div className="bg-white rounded-card shadow-card border border-border-soft p-4">
            <EmptyState
              icon="cloud_off"
              title="Không tải được thống kê"
              description="Kiểm tra kết nối rồi thử lại."
              action={{ label: 'Thử lại', onClick: () => { void refetch() } }}
            />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {kpis.map(({ label, value, unit, color, testId }) => (
                <div key={label} data-testid={testId} className="bg-white rounded-card shadow-card border border-border-soft p-4">
                  <p className="text-[11px] text-neutral-gray mb-1.5">{label}</p>
                  <p className={clsx('text-[20px] font-bold tabular-nums leading-tight', color)}>{value}</p>
                  <p className="text-[11px] text-neutral-gray mt-0.5">{unit}</p>
                </div>
              ))}
            </div>

            {/* Bạn bè đã giới thiệu */}
            <Link
              to="/customer/referrals"
              data-testid="stats-referrals-link"
              className="bg-white rounded-card shadow-card border border-border-soft px-4 py-3 flex items-center gap-3 active:bg-warm-white"
            >
              <div className="w-9 h-9 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[18px]">group_add</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy">Bạn bè đã giới thiệu</p>
                <p className="text-[11px] text-neutral-gray">
                  {referrals
                    ? `${referrals.total_f1.toLocaleString('vi-VN')} bạn · ${referrals.f1_this_month.toLocaleString('vi-VN')} tháng này`
                    : 'Xem bạn bè và hoa hồng điểm thưởng'}
                </p>
              </div>
              <span className="material-symbols-outlined text-neutral-dim text-[16px]">chevron_right</span>
            </Link>

            {/* Biểu đồ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ChartCard
                testId="stats-chart-spent"
                title="Chi tiêu (nghìn đ)"
                loading={loading}
                empty={series.every((s) => s.spent === 0)}
                chartKey={chartKey}
                data={{
                  labels,
                  datasets: [{ data: series.map((s) => s.spent / 1000), backgroundColor: COLORS.primary, borderRadius: 4, borderSkipped: false }],
                }}
                tooltipLabel={(ctx) => ` ${(ctx.parsed.y ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k đ`}
                yTick={(v) => `${v}k`}
              />
              <ChartCard
                testId="stats-chart-trips"
                title="Số chuyến"
                loading={loading}
                empty={series.every((s) => s.completed === 0 && s.cancelled === 0)}
                chartKey={chartKey}
                stacked
                legend
                data={{
                  labels,
                  datasets: [
                    { label: 'Hoàn thành', data: series.map((s) => s.completed), backgroundColor: COLORS.primary, borderRadius: 4, borderSkipped: false },
                    { label: 'Đã huỷ', data: series.map((s) => s.cancelled), backgroundColor: COLORS.danger, borderRadius: 4, borderSkipped: false },
                  ],
                }}
              />
              <ChartCard
                testId="stats-chart-points"
                title="Điểm thưởng"
                loading={loading}
                empty={series.every((s) => s.cashback_points === 0 && s.commission_points === 0)}
                chartKey={chartKey}
                stacked
                legend
                data={{
                  labels,
                  datasets: [
                    { label: 'Hoàn điểm', data: series.map((s) => s.cashback_points), backgroundColor: COLORS.gold, borderRadius: 4, borderSkipped: false },
                    { label: 'Hoa hồng', data: series.map((s) => s.commission_points), backgroundColor: COLORS.success, borderRadius: 4, borderSkipped: false },
                  ],
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
