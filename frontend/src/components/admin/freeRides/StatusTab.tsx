import { useQuery } from '@tanstack/react-query'
import { getFreeRideStatus } from '@/api/adminFreeRides'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'

const fmtAgo = (ms: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000))
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  return `${hours} giờ trước`
}

const fmtUsd = (n: number) => `$${n.toFixed(2)}`

export default function StatusTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-free-ride-status'],
    queryFn: () => getFreeRideStatus().then((r) => r.data),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-sm text-danger-red text-center">Không tải được tình trạng service</p>
        <button onClick={() => refetch()} className="text-sm font-semibold text-primary">
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {/* Tổng quan */}
      <div className="bg-white rounded-card shadow-card p-4 flex divide-x divide-border-soft">
        <div className="flex-1 flex flex-col items-center">
          <p className="text-[18px] font-bold text-navy">{data.active_rides}</p>
          <p className="text-[11px] text-neutral-gray">Cuốc đang hiện</p>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <p className="text-[18px] font-bold text-navy">{data.groups_enabled}/{data.groups_total}</p>
          <p className="text-[11px] text-neutral-gray">Nhóm đang bật</p>
        </div>
      </div>

      {data.services.length === 0 && (
        <EmptyState icon="satellite_alt" title="Chưa có service Zalo nào gửi tín hiệu" />
      )}

      {data.services.map((svc) => {
        const budgetPct = svc.ai_budget_usd > 0 ? Math.min(100, (svc.ai_spent_today_usd / svc.ai_budget_usd) * 100) : 0
        return (
          <div key={svc.service_id} className="bg-white rounded-card shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-navy">{svc.service_id}</p>
              <span className={clsx('text-[12px] font-medium', svc.stale ? 'text-danger-red' : 'text-neutral-gray')}>
                Heartbeat: {fmtAgo(svc.last_heartbeat_at)}
              </span>
            </div>

            {/* Thẻ từng nick */}
            <div className="flex flex-col gap-2">
              {svc.accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between bg-warm-white rounded-input px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-navy truncate">{acc.id}</p>
                    {acc.last_error && (
                      <p className="text-[11px] text-danger-red truncate">{acc.last_error}</p>
                    )}
                  </div>
                  {/* Heartbeat quá hạn: trạng thái nick là số liệu cũ, không biết còn kết nối hay không. */}
                  <span className={clsx(
                    'text-[11px] font-semibold rounded-pill px-2.5 py-1 shrink-0',
                    svc.stale
                      ? 'bg-neutral-gray/15 text-neutral-gray'
                      : acc.connected ? 'bg-success-green/15 text-success-green' : 'bg-danger-red/15 text-danger-red',
                  )}>
                    {svc.stale ? 'Không rõ' : acc.connected ? 'Đang kết nối' : 'Mất kết nối'}
                  </span>
                </div>
              ))}
              {svc.accounts.length === 0 && (
                <p className="text-[12px] text-neutral-gray">Không có tài khoản nào</p>
              )}
            </div>

            {/* Chi phí AI hôm nay */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-neutral-gray">Chi phí AI hôm nay</span>
                <span className="font-semibold text-navy">
                  {fmtUsd(svc.ai_spent_today_usd)} / {fmtUsd(svc.ai_budget_usd)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-border-gray rounded-pill overflow-hidden">
                <div
                  className={clsx('h-full rounded-pill', budgetPct >= 100 ? 'bg-danger-red' : 'bg-primary')}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>

            {/* Hàng chỉ số còn lại */}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="bg-warm-white rounded-input px-3 py-2">
                <p className="text-neutral-gray">Hộp thư đi tồn</p>
                <p className="font-semibold text-navy">{svc.outbox_backlog}</p>
              </div>
              <div className="bg-warm-white rounded-input px-3 py-2">
                <p className="text-neutral-gray">Cuốc bị giữ vì thiếu mã</p>
                <p className="font-semibold text-navy">{svc.held_back_rides}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
