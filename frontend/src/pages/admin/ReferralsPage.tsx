import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import dayjs from 'dayjs'
import { getReferralReport, getReferrerDetail } from '@/api/adminReferrals'
import EmptyState from '@/components/common/EmptyState'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const MEDAL = ['🥇', '🥈', '🥉']

export default function ReferralsPage() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-referrals', month],
    queryFn: () => getReferralReport(month).then((r) => r.data),
  })

  const { data: detail, isLoading: detailLoading, isError: detailIsError, refetch: refetchDetail } = useQuery({
    queryKey: ['admin-referral-detail', detailId],
    queryFn: () => getReferrerDetail(detailId!).then((r) => r.data),
    enabled: detailId !== null,
  })

  const selectedMonthRow = data?.monthly.find((m) => m.month === data.month)

  const chartData = {
    labels: data?.monthly.map((m) => dayjs(`${m.month}-01`).format('MM/YY')) ?? [],
    datasets: [
      {
        label: 'F1 đăng ký',
        data: data?.monthly.map((m) => m.f1_registered) ?? [],
        backgroundColor: '#006a36',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y',
      },
      {
        label: 'Doanh số F1',
        data: data?.monthly.map((m) => m.f1_revenue) ?? [],
        backgroundColor: '#D4AF37',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y1',
      },
    ],
  }

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-h2 text-navy font-semibold">Giới thiệu</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-input border border-border-gray px-3 py-2 text-sm text-navy outline-none focus:border-primary"
        />
      </div>

      {isError ? (
        <div className="bg-white rounded-card shadow-card p-4">
          <EmptyState
            icon="cloud_off"
            title="Không tải được báo cáo giới thiệu"
            description="Kiểm tra kết nối rồi thử lại."
            action={{ label: 'Thử lại', onClick: () => { void refetch() } }}
          />
        </div>
      ) : (
        <>
          {/* Monthly chart */}
          <div data-testid="referral-report-chart" className="bg-white rounded-card shadow-card p-4">
            <p className="text-[13px] font-semibold text-navy mb-3">F1 đăng ký &amp; doanh số theo tháng</p>
            {isLoading ? (
              <div className="h-40 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
              </div>
            ) : (
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ctx.dataset.yAxisID === 'y1'
                          ? ` ${(ctx.raw as number).toLocaleString('vi-VN')}đ`
                          : ` ${ctx.raw} F1`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      type: 'linear',
                      position: 'left',
                      beginAtZero: true,
                      ticks: { precision: 0, font: { size: 10 } },
                      grid: { color: '#f0f0f0' },
                    },
                    y1: {
                      type: 'linear',
                      position: 'right',
                      beginAtZero: true,
                      ticks: {
                        callback: (v) => `${Math.round(Number(v) / 1000).toLocaleString('vi-VN')}K`,
                        font: { size: 10 },
                      },
                      grid: { display: false },
                    },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            )}
            <p className="text-sm text-neutral-gray mt-3">
              Điểm thưởng đã phát tháng này: <span className="font-semibold text-gold">{(selectedMonthRow?.reward_points ?? 0).toLocaleString('vi-VN')}</span> điểm
            </p>
          </div>

          {/* Top 10 */}
          <div data-testid="referral-report-top" className="bg-white rounded-card shadow-card p-4">
            <p className="text-[13px] font-semibold text-navy mb-3">Top 10 người giới thiệu</p>
            {isLoading ? (
              <div className="h-24 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
              </div>
            ) : !data || data.top.length === 0 ? (
              <EmptyState
                icon="group_add"
                title="Chưa có dữ liệu"
                description="Tháng này chưa có người giới thiệu nào phát sinh doanh số từ F1"
              />
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-neutral-gray border-b border-border-gray">
                      <th className="py-2 pr-2 font-medium">Hạng</th>
                      <th className="py-2 pr-2 font-medium">Người giới thiệu</th>
                      <th className="py-2 pr-2 font-medium text-right">Tổng F1</th>
                      <th className="py-2 pr-2 font-medium text-right">Doanh số F1 tháng</th>
                      <th className="py-2 pl-2 font-medium text-right">Hoa hồng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => setDetailId(row.id)}
                        className="border-b border-border-gray last:border-0 cursor-pointer hover:bg-warm-white"
                      >
                        <td className="py-2.5 pr-2 w-8">{i < 3 ? MEDAL[i] : i + 1}</td>
                        <td className="py-2.5 pr-2">
                          <p className="font-semibold text-navy">{row.name || 'Không tên'}</p>
                          <p className="text-neutral-gray">{row.phone || '—'}</p>
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-navy">{row.f1_total}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-navy">{row.f1_revenue.toLocaleString('vi-VN')}đ</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-semibold text-success-green">+{row.commission_points.toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail panel */}
      {detailId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setDetailId(null)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-gray">
              <div>
                <p className="text-[15px] font-semibold text-navy">{detail?.name || 'Người giới thiệu'}</p>
                <p className="text-[12px] text-neutral-gray">{detail?.phone}</p>
              </div>
              <button onClick={() => setDetailId(null)}>
                <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-6">
              {detailLoading && <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>}
              {!detailLoading && detailIsError && (
                <EmptyState
                  icon="cloud_off"
                  title="Không tải được chi tiết"
                  description="Kiểm tra kết nối rồi thử lại."
                  action={{ label: 'Thử lại', onClick: () => { void refetchDetail() } }}
                />
              )}
              {!detailLoading && !detailIsError && detail?.f1.length === 0 && (
                <p className="text-caption text-neutral-gray text-center py-10">Chưa có F1 nào</p>
              )}
              {!detailIsError && detail?.f1.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-3 py-3 border-b border-border-gray last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{f.name || 'Khách hàng'}</p>
                    <p className="text-[12px] text-neutral-gray">{f.phone}</p>
                    <p className="text-[12px] text-neutral-gray mt-0.5">
                      Đăng ký {dayjs(f.registered_at).format('DD/MM/YYYY')} · {f.trips} chuyến · {f.spent.toLocaleString('vi-VN')}đ
                    </p>
                  </div>
                  <span className="text-[13px] font-bold text-success-green tabular-nums shrink-0">
                    +{f.commission_points.toLocaleString('vi-VN')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
