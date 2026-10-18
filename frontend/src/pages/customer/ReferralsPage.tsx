import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import dayjs from 'dayjs'
import { getReferrals } from '@/api/rewards'
import EmptyState from '@/components/common/EmptyState'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function ReferralsPage() {
  const navigate = useNavigate()
  const [month, setMonth] = useState('')

  const { data } = useQuery({
    queryKey: ['referrals', month],
    queryFn: () => getReferrals(month || undefined).then((r) => r.data),
  })

  const chartData = {
    labels: data?.monthly.map((m) => dayjs(`${m.month}-01`).format('MM/YY')) ?? [],
    datasets: [
      {
        label: 'Bạn bè mới',
        data: data?.monthly.map((m) => m.count) ?? [],
        backgroundColor: '#006a36',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }

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
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-card shadow-card p-4">
            <p className="text-[11px] text-neutral-gray mb-1">Tổng F1</p>
            <p data-testid="referrals-total" className="text-[22px] font-bold text-primary tabular-nums">
              {data?.total_f1 ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-card shadow-card p-4">
            <p className="text-[11px] text-neutral-gray mb-1">Tháng này</p>
            <p className="text-[22px] font-bold text-gold tabular-nums">
              {data?.f1_this_month ?? 0}
            </p>
          </div>
        </div>

        {/* Monthly chart */}
        <div className="bg-white rounded-card shadow-card p-4">
          <p className="text-[13px] font-semibold text-navy mb-3">Bạn bè mới theo tháng</p>
          <div className="h-[180px]">
            <Bar
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#f0f0f0' } },
                  x: { ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>

        {/* Month filter */}
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="flex-1 rounded-input border border-border-gray px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
          />
          {month && (
            <button
              onClick={() => setMonth('')}
              className="text-[13px] text-primary font-medium whitespace-nowrap"
            >
              Trọn đời
            </button>
          )}
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
      </div>
    </div>
  )
}
