import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js'
import dayjs, { type Dayjs } from 'dayjs'
import clsx from 'clsx'
import { getReferralReport, getReferrerDetail, type ReferralGroup } from '@/api/adminReferrals'
import EmptyState from '@/components/common/EmptyState'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const MEDAL = ['🥇', '🥈', '🥉']
const DATE_FMT = 'YYYY-MM-DD'
const MAX_RANGE_DAYS = 366

function mondayOf(d: Dayjs): Dayjs {
  const dow = d.day() // 0=CN..6=Th7
  return d.subtract(dow === 0 ? 6 : dow - 1, 'day')
}

function autoGroup(from: string, to: string): ReferralGroup {
  const days = dayjs(to).diff(dayjs(from), 'day') + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

const PRESETS: { key: string; label: string; range: () => { from: string; to: string } }[] = [
  {
    key: 'today', label: 'Hôm nay',
    range: () => { const d = dayjs().format(DATE_FMT); return { from: d, to: d } },
  },
  {
    key: 'yesterday', label: 'Hôm qua',
    range: () => { const d = dayjs().subtract(1, 'day').format(DATE_FMT); return { from: d, to: d } },
  },
  {
    key: '7d', label: '7 ngày',
    range: () => ({ from: dayjs().subtract(6, 'day').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'this_week', label: 'Tuần này',
    range: () => ({ from: mondayOf(dayjs()).format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'this_month', label: 'Tháng này',
    range: () => ({ from: dayjs().startOf('month').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: '30d', label: '30 ngày gần nhất',
    range: () => ({ from: dayjs().subtract(29, 'day').format(DATE_FMT), to: dayjs().format(DATE_FMT) }),
  },
  {
    key: 'last_month', label: 'Tháng trước',
    range: () => {
      const m = dayjs().subtract(1, 'month')
      return { from: m.startOf('month').format(DATE_FMT), to: m.endOf('month').format(DATE_FMT) }
    },
  },
]

const GROUPS: { key: ReferralGroup; label: string }[] = [
  { key: 'day', label: 'Ngày' },
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
]

const DEFAULT_RANGE = PRESETS.find((p) => p.key === '30d')!.range()

export default function ReferralsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [detailId, setDetailId] = useState<number | null>(null)

  const from = searchParams.get('from') ?? DEFAULT_RANGE.from
  const to = searchParams.get('to') ?? DEFAULT_RANGE.to
  const rawGroup = searchParams.get('group')
  const group: ReferralGroup = rawGroup === 'week' || rawGroup === 'month' ? rawGroup : 'day'

  const setFilters = (next: { from?: string; to?: string; group?: ReferralGroup }) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('from', next.from ?? from)
      params.set('to', next.to ?? to)
      params.set('group', next.group ?? group)
      return params
    }, { replace: true })
  }

  const applyPreset = (presetKey: string) => {
    const preset = PRESETS.find((p) => p.key === presetKey)
    if (!preset) return
    const { from: f, to: t } = preset.range()
    setFilters({ from: f, to: t, group: autoGroup(f, t) })
  }

  const activePresetKey = PRESETS.find((p) => {
    const r = p.range()
    return r.from === from && r.to === to
  })?.key

  const rangeDays = dayjs(to).diff(dayjs(from), 'day') + 1
  const rangeError = Number.isNaN(dayjs(from).valueOf()) || Number.isNaN(dayjs(to).valueOf())
    ? 'Ngày không hợp lệ.'
    : dayjs(to).isBefore(dayjs(from))
      ? '"Đến ngày" phải sau hoặc bằng "Từ ngày".'
      : rangeDays > MAX_RANGE_DAYS
        ? 'Khoảng thời gian tối đa là 366 ngày.'
        : null

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-referrals', from, to, group],
    queryFn: () => getReferralReport({ from, to, group }).then((r) => r.data),
    enabled: !rangeError,
  })

  const { data: detail, isLoading: detailLoading, isError: detailIsError, refetch: refetchDetail } = useQuery({
    queryKey: ['admin-referral-detail', detailId],
    queryFn: () => getReferrerDetail(detailId!).then((r) => r.data),
    enabled: detailId !== null,
  })

  // Khi khoảng lọc không có dữ liệu, doanh số toàn 0 — Chart.js tự chọn một thang đo
  // suy biến (nhiều mốc chia nhỏ quanh 0) cho trục phải, mỗi mốc chia cho 1.000 rồi làm
  // tròn đều ra "0K" nên trục hiển thị "0K" lặp lại ở mọi nấc. Ép thang đo về đúng
  // 2 mốc [0, 1K] cho trường hợp này để trục có ý nghĩa; có dữ liệu thì để Chart.js tự chọn.
  const maxF1Revenue = Math.max(0, ...(data?.series.map((s) => s.f1_revenue) ?? [0]))
  const revenueAxisIsEmpty = maxF1Revenue === 0

  const chartData = {
    labels: data?.series.map((s) => s.label) ?? [],
    datasets: [
      {
        label: 'F1 đăng ký',
        data: data?.series.map((s) => s.f1_registered) ?? [],
        backgroundColor: '#006a36',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y',
      },
      {
        label: 'Doanh số F1',
        data: data?.series.map((s) => s.f1_revenue) ?? [],
        backgroundColor: '#D4AF37',
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y1',
      },
    ],
  }

  return (
    <div className="w-full flex flex-col gap-4 px-4 py-4">
      <h1 className="text-h2 text-navy font-semibold">Giới thiệu</h1>

      {/* Filter bar */}
      <div className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              data-testid={`referral-preset-${p.key}`}
              onClick={() => applyPreset(p.key)}
              className={clsx(
                'rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap',
                activePresetKey === p.key ? 'bg-primary text-white' : 'bg-light-green text-navy',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-gray">
            Từ ngày
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFilters({ from: e.target.value })}
              className="rounded-input border border-border-gray px-2 py-1.5 text-sm text-navy outline-none focus:border-primary"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-gray">
            Đến ngày
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setFilters({ to: e.target.value })}
              className="rounded-input border border-border-gray px-2 py-1.5 text-sm text-navy outline-none focus:border-primary"
            />
          </label>

          <div className="flex rounded-pill bg-warm-white p-0.5 ml-auto">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                data-testid={`referral-group-${g.key}`}
                onClick={() => setFilters({ group: g.key })}
                className={clsx(
                  'rounded-pill px-3 py-1.5 text-[12px] font-medium transition-colors',
                  group === g.key ? 'bg-primary text-white' : 'text-neutral-gray',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {rangeError && (
          <p className="text-[12px] text-danger-red">{rangeError}</p>
        )}
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
          {/* Summary cards */}
          <div data-testid="referral-summary-cards" className="grid grid-cols-3 gap-3">
            <div data-testid="referral-summary-f1-registered" className="bg-white rounded-card shadow-card p-3">
              <p className="text-[11px] text-neutral-gray mb-1">F1 đăng ký</p>
              <p className="text-[16px] font-bold text-navy tabular-nums">{data?.summary.f1_registered ?? 0}</p>
            </div>
            <div data-testid="referral-summary-f1-revenue" className="bg-white rounded-card shadow-card p-3">
              <p className="text-[11px] text-neutral-gray mb-1">Doanh số F1</p>
              <p className="text-[16px] font-bold text-primary tabular-nums">{(data?.summary.f1_revenue ?? 0).toLocaleString('vi-VN')}đ</p>
            </div>
            <div data-testid="referral-summary-reward-points" className="bg-white rounded-card shadow-card p-3">
              <p className="text-[11px] text-neutral-gray mb-1">Điểm thưởng đã phát</p>
              <p className="text-[16px] font-bold text-gold tabular-nums">{(data?.summary.reward_points ?? 0).toLocaleString('vi-VN')}</p>
            </div>
          </div>

          {/* Chart */}
          <div data-testid="referral-report-chart" className="bg-white rounded-card shadow-card p-4">
            <p className="text-[13px] font-semibold text-navy mb-3">F1 đăng ký &amp; doanh số</p>
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
                      ...(revenueAxisIsEmpty ? { max: 1000 } : {}),
                      ticks: {
                        ...(revenueAxisIsEmpty ? { stepSize: 1000 } : { precision: 0 }),
                        callback: (v) => {
                          const n = Number(v)
                          return n === 0 ? '0' : `${Math.round(n / 1000).toLocaleString('vi-VN')}K`
                        },
                        font: { size: 10 },
                      },
                      grid: { display: false },
                    },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            )}
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
                description="Khoảng thời gian này chưa có người giới thiệu nào phát sinh doanh số từ F1"
              />
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="text-neutral-gray border-b border-border-gray">
                      <th className="py-2 pr-2 font-medium">Hạng</th>
                      <th className="py-2 pr-2 font-medium">Người giới thiệu</th>
                      <th className="py-2 pr-2 font-medium text-right">Tổng F1</th>
                      <th className="py-2 pr-2 font-medium text-right">Doanh số F1</th>
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
