import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { getDriverReferrals, type DriverReferralItem } from '@/api/driverReferrals'

const STATUS: Record<DriverReferralItem['status'], { label: string; cls: string }> = {
  rewarded: { label: 'Đã nhận thưởng', cls: 'bg-light-green text-primary' },
  waiting_approval: { label: 'Chờ duyệt hồ sơ', cls: 'bg-amber-50 text-alert-orange' },
  waiting_trip: { label: 'Chờ chuyến đầu', cls: 'bg-gray-100 text-neutral-gray' },
}

export default function DriverReferralsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['driver-referrals'],
    queryFn: getDriverReferrals,
  })

  const items = data?.items ?? []
  const perRef = data?.reward_points_per_referral ?? 0

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-gray bg-white sticky top-0 z-10">
        <button onClick={() => navigate('/driver/profile')} aria-label="Quay lại" className="min-w-touch min-h-touch -ml-3 flex items-center justify-center">
          <span className="material-symbols-outlined text-navy">arrow_back</span>
        </button>
        <h1 className="text-base font-semibold text-navy">Tài xế đã giới thiệu</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
        </div>
      )}

      {isError && <p className="text-center text-sm text-danger-red py-16">Không tải được danh sách. Vui lòng thử lại.</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 px-4 pt-4">
            <div className="bg-white rounded-card shadow-card p-3 text-center">
              <p className="text-lg font-bold text-navy">{data.total_f1}</p>
              <p className="text-[11px] text-neutral-gray">Đã giới thiệu</p>
            </div>
            <div className="bg-white rounded-card shadow-card p-3 text-center">
              <p className="text-lg font-bold text-navy">{data.rewarded_count}</p>
              <p className="text-[11px] text-neutral-gray">Đã nhận thưởng</p>
            </div>
            <div className="bg-white rounded-card shadow-card p-3 text-center">
              <p className="text-lg font-bold text-gold">{data.total_reward_points.toLocaleString('vi-VN')}</p>
              <p className="text-[11px] text-neutral-gray">Điểm thưởng</p>
            </div>
          </div>
          <p className="text-[12px] text-neutral-gray px-4 pt-3">
            Mỗi tài xế giới thiệu thành công, cả hai nhận {perRef.toLocaleString('vi-VN')} điểm ({(perRef * 1000).toLocaleString('vi-VN')}đ)
            khi họ được duyệt hồ sơ và hoàn thành chuyến đầu tiên.
          </p>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <span className="material-symbols-outlined text-5xl text-border-gray mb-3">group_add</span>
              <p className="text-navy font-semibold text-sm">Chưa có tài xế nào</p>
              <p className="text-neutral-gray text-xs mt-1 text-center">Chia sẻ link giới thiệu ở Hồ sơ để mời tài xế mới</p>
            </div>
          ) : (
            <div className="mx-4 mt-3 mb-6 bg-white rounded-card shadow-card divide-y divide-border-gray">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-4 py-3" data-testid="driver-referral-item">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{it.name}</p>
                    <p className="text-[12px] text-neutral-gray">
                      {it.phone_masked} · {it.registered_at ? new Date(it.registered_at).toLocaleDateString('vi-VN') : '—'} · {it.trips} chuyến
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={clsx('inline-block text-[11px] font-semibold px-2 py-0.5 rounded-pill', STATUS[it.status].cls)}>
                      {STATUS[it.status].label}
                    </span>
                    {it.reward_points > 0 && (
                      <p className="text-[12px] font-bold text-gold mt-0.5">+{it.reward_points.toLocaleString('vi-VN')} điểm</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
