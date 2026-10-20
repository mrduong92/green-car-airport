import { useInfiniteQuery } from '@tanstack/react-query'
import { getDriverWalletAdjustments } from '@/api/admin'
import { useState } from 'react'
import clsx from 'clsx'

const FILTERS: { kind: App.WalletHistoryKind; label: string }[] = [
  { kind: 'all', label: 'Tất cả' },
  { kind: 'topup', label: 'Nạp' },
  { kind: 'trip', label: 'Trừ theo cuốc' },
  { kind: 'refund', label: 'Hoàn' },
  { kind: 'admin', label: 'Admin điều chỉnh' },
]

const CATEGORY_LABEL: Record<App.WalletAdjustment['category'], string> = {
  topup: 'Nạp',
  app_fee: 'Phí app',
  collection: 'Thu hộ',
  refund: 'Hoàn phí',
  admin: 'Admin điều chỉnh',
  other: 'Khác',
}

interface Props {
  driver: App.DriverProfile
  onClose: () => void
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })

export default function DriverPointsHistoryModal({ driver, onClose }: Props) {
  const [kind, setKind] = useState<App.WalletHistoryKind>('all')
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    // Nằm dưới key 'drivers' để nạp/trừ điểm (invalidate ['drivers']) tự làm mới lịch sử
    queryKey: ['drivers', 'wallet-adjustments', driver.id, kind],
    queryFn: ({ pageParam }) => getDriverWalletAdjustments(driver.id, pageParam, kind).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.current_page < last.last_page ? last.current_page + 1 : undefined),
  })

  const items = data?.pages.flatMap((p) => p.data) ?? []
  const balance = data?.pages[0]?.balance ?? driver.points ?? 0

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border-gray">
          <div>
            <p className="text-[15px] font-semibold text-navy">Lịch sử điểm</p>
            <p className="text-[12px] text-neutral-gray">
              {driver.name} · Số dư hiện tại: <span className="font-semibold text-gold">{balance.toLocaleString('vi')} điểm</span>
            </p>
          </div>
          <button onClick={onClose}>
            <span className="material-symbols-outlined text-neutral-gray text-[20px]">close</span>
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b border-border-gray">
          {FILTERS.map((f) => (
            <button
              key={f.kind}
              onClick={() => setKind(f.kind)}
              className={clsx(
                'text-xs rounded-pill px-3 py-1.5 font-medium whitespace-nowrap shrink-0',
                kind === f.kind ? 'bg-primary text-white' : 'bg-light-green text-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-4 pb-6">
          {isLoading && <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>}
          {!isLoading && items.length === 0 && (
            <p className="text-caption text-neutral-gray text-center py-10">Chưa có giao dịch điểm nào</p>
          )}
          {items.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 py-3 border-b border-border-gray last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy">
                  {CATEGORY_LABEL[t.category]}
                  {t.booking_id != null && <span className="text-neutral-gray font-normal"> · Cuốc #{t.booking_id}</span>}
                </p>
                {t.description && <p className="text-[12px] text-neutral-gray break-words">{t.description}</p>}
                <p className="text-[12px] text-neutral-gray mt-0.5">
                  {fmt(t.created_at)}{t.category === 'admin' ? ` · ${t.creator_name ?? 'Admin'}` : ''}
                </p>
              </div>
              <span className={clsx('text-sm font-semibold shrink-0', t.direction === 'in' ? 'text-success-green' : 'text-danger-red')}>
                {t.direction === 'in' ? '+' : '−'}{t.points.toLocaleString('vi')}
              </span>
            </div>
          ))}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full mt-3 text-sm text-primary font-medium py-2"
            >
              {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
