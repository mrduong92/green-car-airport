import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import EmptyState from '@/components/common/EmptyState'
import FreeRideCard from '@/components/driver/FreeRideCard'
import FreeRideFilters from '@/components/driver/FreeRideFilters'
import FreeRideActionsSheet from '@/components/driver/FreeRideActionsSheet'
import FreeRideAlertSheet from '@/components/driver/FreeRideAlertSheet'
import { FREE_ALERT_QUERY_KEY, getFreeRideAlert, summarizeAlertFilters } from '@/api/freeRides'
import { useFreeRides } from '@/hooks/useFreeRides'

const STORAGE_KEY = 'free-rides-filters'

const DIRECTIONS: readonly App.FreeRideDirection[] = ['to_airport', 'from_airport', 'other']
const WINDOWS: readonly NonNullable<App.FreeRideFilters['window']>[] = ['2h', 'today', 'tomorrow']

// Bộ lọc lưu từ phiên bản cũ / bị sửa tay có thể sai kiểu — chỉ giữ giá trị hợp lệ, còn lại bỏ.
function loadFilters(): App.FreeRideFilters {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    const r = raw as Record<string, unknown>
    const filters: App.FreeRideFilters = {}
    if (DIRECTIONS.includes(r.direction as App.FreeRideDirection)) filters.direction = r.direction as App.FreeRideDirection
    if (typeof r.seats === 'number' && Number.isInteger(r.seats) && r.seats >= 1 && r.seats <= 60) filters.seats = r.seats
    if (WINDOWS.includes(r.window as NonNullable<App.FreeRideFilters['window']>)) filters.window = r.window as App.FreeRideFilters['window']
    if (typeof r.q === 'string' && r.q.length <= 100) filters.q = r.q
    return filters
  } catch {
    return {}
  }
}

export default function FreeRidesPage() {
  const [filters, setFilters] = useState<App.FreeRideFilters>(loadFilters)
  const [selected, setSelected] = useState<App.FreeRide | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const { rides, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, removeSender } = useFreeRides(filters)

  // Cùng khoá query với FreeRideAlertSheet — trạng thái hiện ngay trên nút chuông, sheet đọc lại
  // từ cache thay vì gọi API lần nữa khi mở.
  const { data: alert } = useQuery({
    queryKey: FREE_ALERT_QUERY_KEY,
    queryFn: () => getFreeRideAlert().then((r) => r.data),
  })

  const changeFilters = useCallback((next: App.FreeRideFilters) => {
    setFilters(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* trình duyệt chặn lưu → chỉ mất ghi nhớ bộ lọc */ }
  }, [])

  return (
    <div className="w-full flex flex-col">
      <FreeRideFilters value={filters} onChange={changeFilters} />
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-[12px] text-neutral-gray flex-1">
          Cuốc tổng hợp từ các nhóm Zalo. GreenCA chỉ kết nối — bạn trao đổi trực tiếp với người bắn cuốc.
        </p>
        <button
          type="button"
          data-testid="free-alert-open"
          onClick={() => setAlertOpen(true)}
          className={
            'shrink-0 flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap max-w-[55%] '
            + (alert?.enabled ? 'bg-light-green text-primary' : 'bg-white border border-border-gray text-neutral-gray')
          }
        >
          <span className="material-symbols-outlined text-[16px] shrink-0">
            {alert?.enabled ? 'notifications_active' : 'notifications'}
          </span>
          <span className="truncate">
            {alert?.enabled
              ? `Đang báo · ${summarizeAlertFilters({ direction: alert.direction, seats: alert.seats, q: alert.keywords })}`
              : 'Báo khi có cuốc phù hợp'}
          </span>
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-neutral-gray py-10">Đang tải cuốc…</p>
      ) : isError && rides.length === 0 ? (
        <EmptyState icon="cloud_off" title="Không tải được cuốc Free" description="Kiểm tra kết nối mạng rồi thử lại."
          action={{ label: 'Thử lại', onClick: () => { void refetch() } }} />
      ) : rides.length === 0 ? (
        <EmptyState icon="local_taxi" title="Chưa có cuốc Free phù hợp" description="Thử đổi bộ lọc hoặc quay lại sau ít phút." />
      ) : (
        <div className="flex flex-col px-4 gap-2.5 pb-4">
          {rides.map((ride) => <FreeRideCard key={ride.ride_uid} ride={ride} onMore={setSelected} />)}
          {hasNextPage && (
            <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="w-full min-h-touch text-sm text-primary font-medium">
              {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {selected && <FreeRideActionsSheet ride={selected} onClose={() => setSelected(null)} onSenderHidden={removeSender} />}
      {alertOpen && <FreeRideAlertSheet filters={filters} onClose={() => setAlertOpen(false)} />}
    </div>
  )
}
