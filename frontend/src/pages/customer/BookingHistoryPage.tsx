import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
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

function dateLabel(dateStr: string): string {
  const d = dayjs(dateStr)
  const now = dayjs()
  if (d.isSame(now, 'day')) return 'Hôm nay'
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Hôm qua'
  return d.format('DD/MM/YYYY')
}

/**
 * Gom chuyến theo ngày, giữ nguyên thứ tự server trả về (mới nhất trước).
 * Không sắp xếp lại: danh sách phân trang theo cursor nên tự ý sắp lại ở client
 * sẽ làm các trang tải sau chèn sai chỗ.
 */
function groupByDate(bookings: App.Booking[]) {
  const map = new Map<string, App.Booking[]>()
  for (const b of bookings) {
    if (!map.has(b.date)) map.set(b.date, [])
    map.get(b.date)!.push(b)
  }

  return Array.from(map.entries()).map(([date, items]) => ({
    date,
    label: dateLabel(date),
    items,
  }))
}

export default function BookingHistoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')

  const {
    data: pages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['bookings', filter],
    queryFn: ({ pageParam }) =>
      getBookingHistory({ status: filter || undefined, cursor: pageParam }).then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })

  const data = pages?.pages.flatMap((p) => p.data) ?? []
  const groups = groupByDate(data)

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

      <div className="flex flex-col px-4 py-4 gap-4">
        {!data.length && (
          <EmptyState icon="receipt_long" title="Chưa có chuyến nào"
            description="Các chuyến đã đặt sẽ xuất hiện ở đây"
            action={{ label: 'Đặt xe ngay', onClick: () => navigate('/customer/booking') }} />
        )}

        {groups.map(({ date, label, items }) => (
          <div key={date} className="flex flex-col gap-2">
            {/* Đầu nhóm ngày — cùng bố cục với màn Lịch sử của tài xế.
                KHÔNG hiện tổng tiền như bên tài xế: danh sách này phân trang nên
                tổng cộng ở client chỉ tính được phần đã tải, cuộn thêm là số nhảy.
                Tổng chi tiêu chính xác nằm ở tab Thống kê (tính bằng SQL). */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">{label}</span>
              <div className="flex-1 h-px bg-border-gray" />
            </div>

            {items.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/customer/booking/${b.id}`)}
                className="w-full bg-white rounded-card shadow-card overflow-hidden text-left"
              >
                <div className="flex items-center p-4 gap-3">
                  {/* Giờ đón + quãng đường, thay cho cột ngày cũ vì ngày đã nằm ở
                      đầu nhóm — tránh lặp lại cùng một thông tin hai lần. */}
                  <div className="shrink-0 w-11 text-center">
                    <p className="text-[15px] font-bold text-navy leading-tight">{b.time.slice(0, 5)}</p>
                    <p className="text-[10px] text-neutral-gray mt-0.5">{b.distance_km} km</p>
                  </div>

                  <div className="w-px self-stretch bg-border-gray" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm text-navy mb-1">
                      <span className="truncate">{b.pickup}</span>
                      <span className="material-symbols-outlined text-sm text-neutral-gray shrink-0">arrow_right_alt</span>
                      <span className="truncate">{b.destination}</span>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-bold text-primary text-sm">
                      {(b.final_price ?? b.price).toLocaleString('vi')} đ
                    </span>
                    {/* Dấu hiệu "bấm vào mở trang" — trước đây thẻ này mở rộng tại
                        chỗ nên không có gì báo cho người dùng biết nó dẫn đi đâu. */}
                    <span className="material-symbols-outlined text-neutral-gray text-[18px]">chevron_right</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full h-11 rounded-pill border border-primary text-primary text-sm font-semibold disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Đang tải...' : 'Xem thêm'}
          </button>
        )}
      </div>
    </div>
  )
}
