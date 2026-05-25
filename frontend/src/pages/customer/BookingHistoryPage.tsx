import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getBookingHistory } from '@/api/bookings'
import StatusBadge from '@/components/common/StatusBadge'
import EmptyState from '@/components/common/EmptyState'
import dayjs from 'dayjs'
import clsx from 'clsx'

const FILTERS = [
  { key: '', label: 'Tất cả' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã huỷ' },
]

export default function BookingHistoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data } = useQuery({
    queryKey: ['bookings', filter],
    queryFn: () => getBookingHistory({ status: filter || undefined }).then((r) => r.data),
  })

  return (
    <div className="w-full flex flex-col gap-0">
      {/* Filter tabs */}
      <div className="bg-white px-4 pt-3 pb-0 border-b border-border-gray">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={clsx('rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                filter === f.key ? 'bg-primary text-white' : 'bg-light-green text-primary')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col px-4 py-4 gap-3">
        {!data?.length && (
          <EmptyState icon="receipt_long" title="Chưa có chuyến nào"
            description="Các chuyến đã đặt sẽ xuất hiện ở đây"
            action={{ label: 'Đặt xe ngay', onClick: () => navigate('/customer/booking') }} />
        )}
        {data?.map((b) => (
          <div key={b.id} className="bg-white rounded-card shadow-card overflow-hidden"
            onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
            <div className="flex p-4 gap-3">
              {/* Date column */}
              <div className="flex flex-col items-center justify-center w-12 shrink-0">
                <span className="text-2xl font-bold text-navy leading-none">{dayjs(b.date).format('DD')}</span>
                <span className="text-caption text-neutral-gray">{dayjs(b.date).format('MMM')}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 text-sm text-navy mb-1">
                  <span className="truncate">{b.pickup}</span>
                  <span className="material-symbols-outlined text-sm text-neutral-gray shrink-0">arrow_right_alt</span>
                  <span className="truncate">{b.destination}</span>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <span className="font-bold text-primary text-sm shrink-0">{(b.final_price ?? b.price).toLocaleString('vi')} đ</span>
            </div>
            {expanded === b.id && (
              <div className="border-t border-border-gray px-4 py-3 bg-light-green/30 flex flex-col gap-1">
                <p className="text-caption text-neutral-gray">Tài xế: {b.driver?.name ?? 'Chưa có'}</p>
                <p className="text-caption text-neutral-gray">Khoảng cách: {b.distance_km} km</p>
                <p className="text-caption text-neutral-gray">Giá gốc: {b.price.toLocaleString('vi')}đ</p>
                {(b.discount ?? 0) > 0 && (
                  <p className="text-caption text-success-green">
                    Voucher {b.voucher_code}: -{(b.discount ?? 0).toLocaleString('vi')}đ
                  </p>
                )}
                {(b.surcharge ?? 0) > 0 && (
                  <p className="text-caption text-danger-red">
                    Phụ phí: +{(b.surcharge ?? 0).toLocaleString('vi')}đ
                  </p>
                )}
                <p className="text-caption text-neutral-gray">Mã đặt: #{b.id}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
