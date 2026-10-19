import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import dayjs from 'dayjs'
import { getReferrals, type ReferralSeriesPoint } from '@/api/rewards'
import EmptyState from '@/components/common/EmptyState'
import DateRangeFilter from '@/components/common/DateRangeFilter'
import { useDateRangeParams } from '@/hooks/useDateRangeParams'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface ChartCardProps {
  testId: string
  title: string
  chartKey: string
  series: ReferralSeriesPoint[]
  value: (p: ReferralSeriesPoint) => number
  color: string
  integerTicks?: boolean
  tooltipLabel: (v: number) => string
}

function ChartCard({ testId, title, chartKey, series, value, color, integerTicks, tooltipLabel }: ChartCardProps) {
  const values = series.map(value)
  const isEmpty = values.every((v) => v === 0)

  return (
    <div data-testid={testId} className="bg-white rounded-card shadow-card p-4">
      <p className="text-[13px] font-semibold text-navy mb-3">{title}</p>
      {isEmpty ? (
        <div className="h-[180px] flex items-center justify-center text-[12px] text-neutral-gray">
          Chưa có dữ liệu trong khoảng này
        </div>
      ) : (
        <div className="h-[180px]">
          {/* key: vẽ lại từ đầu khi đổi khoảng/kiểu gom — tránh cột cũ "trượt" sang số mốc mới */}
          <Bar
            key={chartKey}
            data={{
              labels: series.map((p) => p.label),
              datasets: [{ label: title, data: values, backgroundColor: color, borderRadius: 6, borderSkipped: false }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${tooltipLabel(ctx.raw as number)}` } },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { font: { size: 10 }, ...(integerTicks ? { precision: 0 } : {}) },
                  grid: { color: '#f0f0f0' },
                },
                x: { ticks: { font: { size: 10 } } },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function ReferralsPage() {
  const navigate = useNavigate()
  const range = useDateRangeParams('this_month')
  const { from, to, group, rangeError } = range

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['referrals', from, to, group],
    queryFn: () => getReferrals({ from, to, group }).then((r) => r.data),
    enabled: !rangeError,
  })

  const chartKey = `${data?.from}-${data?.to}-${data?.group}`
  const fmt = (n: number) => n.toLocaleString('vi-VN')
  const s = data?.summary

  return (
    <div className="w-full flex flex-col pb-8">
      {/* Header */}
      <div className="px-4 pt-4 pb-5 bg-white border-b border-border-gray flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center">
          <span className="material-symbols-outlined text-navy">arrow_back</span>
        </button>
        <p className="font-semibold text-navy text-[16px]">Bạn bè đã giới thiệu</p>
      </div>

      <div className="mx-4 mt-4 flex flex-col gap-4">
        <DateRangeFilter range={range} testIdPrefix="referrals" />

        {isError ? (
          <div className="bg-white rounded-card shadow-card p-4">
            <EmptyState
              icon="cloud_off"
              title="Không tải được dữ liệu giới thiệu"
              description="Kiểm tra kết nối rồi thử lại."
              action={{ label: 'Thử lại', onClick: () => { void refetch() } }}
            />
          </div>
        ) : isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div data-testid="referrals-summary-cards" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white rounded-card shadow-card p-3">
                <p className="text-[11px] text-neutral-gray mb-1">Tổng bạn bè</p>
                <p data-testid="referrals-total" className="text-[18px] font-bold text-primary tabular-nums">
                  {fmt(s?.total_f1 ?? 0)}
                </p>
              </div>
              <div className="bg-white rounded-card shadow-card p-3">
                <p className="text-[11px] text-neutral-gray mb-1">Bạn bè mới</p>
                <p data-testid="referrals-new" className="text-[18px] font-bold text-navy tabular-nums">{fmt(s?.new_f1 ?? 0)}</p>
              </div>
              <div className="bg-white rounded-card shadow-card p-3">
                <p className="text-[11px] text-neutral-gray mb-1">Chuyến của bạn bè</p>
                <p data-testid="referrals-trips" className="text-[18px] font-bold text-navy tabular-nums">{fmt(s?.f1_trips ?? 0)}</p>
              </div>
              <div className="bg-white rounded-card shadow-card p-3">
                <p className="text-[11px] text-neutral-gray mb-1">Doanh số của bạn bè</p>
                <p data-testid="referrals-revenue" className="text-[18px] font-bold text-navy tabular-nums">
                  {fmt(s?.f1_revenue ?? 0)}<span className="text-[12px] font-medium ml-0.5">đ</span>
                </p>
              </div>
              <div className="bg-white rounded-card shadow-card p-3 col-span-2 sm:col-span-1">
                <p className="text-[11px] text-neutral-gray mb-1">Hoa hồng nhận được</p>
                <p data-testid="referrals-commission" className="text-[18px] font-bold text-gold tabular-nums">
                  {fmt(s?.commission_points ?? 0)}<span className="text-[12px] font-medium ml-0.5">điểm</span>
                </p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ChartCard
                testId="referrals-chart-new"
                title="Bạn bè mới"
                chartKey={chartKey}
                series={data?.series ?? []}
                value={(p) => p.new_f1}
                color="#006a36"
                integerTicks
                tooltipLabel={(v) => `${v} bạn`}
              />
              <ChartCard
                testId="referrals-chart-revenue"
                title="Doanh số của bạn bè (nghìn đ)"
                chartKey={chartKey}
                series={data?.series ?? []}
                value={(p) => p.f1_revenue / 1000}
                color="#0F1F2E"
                tooltipLabel={(v) => `${fmt(v)}k đ`}
              />
              <ChartCard
                testId="referrals-chart-commission"
                title="Hoa hồng (điểm)"
                chartKey={chartKey}
                series={data?.series ?? []}
                value={(p) => p.commission_points}
                color="#D4AF37"
                integerTicks
                tooltipLabel={(v) => `${fmt(v)} điểm`}
              />
            </div>

            {/* F1 list */}
            {data && data.items.length === 0 ? (
              <EmptyState
                icon="group_add"
                title="Chưa có bạn bè"
                description="Chia sẻ số điện thoại của bạn để mời bạn bè"
              />
            ) : (
              <div className="flex flex-col gap-2">
                {data?.items.map((item) => (
                  <div key={item.id} className="bg-white rounded-card shadow-card px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-tint flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary text-[18px]">person</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-navy truncate">{item.name || 'Khách hàng'}</p>
                      <p className="text-[11px] text-neutral-gray">{item.phone_masked}</p>
                      <p className="text-[11px] text-neutral-gray mt-0.5">
                        Đăng ký {dayjs(item.registered_at).format('DD/MM/YYYY')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] text-neutral-gray">
                        {item.trips} chuyến · {item.spent.toLocaleString('vi-VN')}đ
                      </p>
                      <p className="text-[13px] font-bold text-success-green tabular-nums">
                        +{item.commission_points.toLocaleString('vi-VN')} điểm
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
