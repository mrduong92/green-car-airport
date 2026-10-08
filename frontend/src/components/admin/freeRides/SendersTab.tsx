import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFreeRideSenders, blockFreeRideSender, unblockFreeRideSender } from '@/api/adminFreeRides'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import clsx from 'clsx'

const QUERY_ROOT = ['admin-free-ride-senders'] as const

export default function SendersTab() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [blockTarget, setBlockTarget] = useState<App.AdminFreeRideSender | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...QUERY_ROOT, q, blockedOnly],
    queryFn: ({ pageParam }) =>
      getFreeRideSenders({ q: q || undefined, blocked: blockedOnly || undefined, page: pageParam }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  })

  const senders = data?.pages.flatMap((p) => p.data) ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_ROOT })

  const blockMutation = useMutation({
    mutationFn: (uid: string) => blockFreeRideSender(uid),
    onSuccess: () => {
      showToast('Đã chặn người bắn', 'success')
      setBlockTarget(null)
      invalidate()
    },
    onError: () => showToast('Chặn thất bại', 'error'),
  })

  const unblockMutation = useMutation({
    mutationFn: (uid: string) => unblockFreeRideSender(uid),
    onSuccess: () => {
      showToast('Đã bỏ chặn người bắn', 'success')
      invalidate()
    },
    onError: () => showToast('Bỏ chặn thất bại', 'error'),
  })

  return (
    <div className="flex flex-col gap-0">
      {/* Search + filter */}
      <div className="bg-white px-4 pt-4 pb-4 border-b border-border-gray flex flex-col gap-3">
        <div className="flex items-center gap-2 border border-border-gray rounded-input px-3 py-2">
          <span className="material-symbols-outlined text-neutral-gray text-xl">search</span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo tên, UID"
            className="flex-1 outline-none text-sm text-navy"
          />
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-navy font-medium">Chỉ người đang bị chặn</span>
          <button
            onClick={() => setBlockedOnly((v) => !v)}
            role="switch"
            aria-checked={blockedOnly}
            className={clsx(
              'relative w-[52px] h-[30px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none',
              blockedOnly ? 'bg-primary' : 'bg-neutral-gray/40',
            )}
          >
            <span
              className={clsx(
                'absolute top-[3px] w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200',
                blockedOnly ? 'left-[23px]' : 'left-[3px]',
              )}
            />
          </button>
        </label>
      </div>

      <div className="flex flex-col px-4 py-4 gap-3">
        {isLoading && (
          <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-danger-red text-center">Không tải được danh sách người bắn</p>
            <button onClick={() => refetch()} className="text-sm font-semibold text-primary">
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !isError && senders.length === 0 && (
          <EmptyState icon="person_off" title="Không tìm thấy người bắn" description="Thử thay đổi từ khoá hoặc bộ lọc" />
        )}

        {senders.map((s) => (
          <div key={s.sender_uid} data-testid="admin-sender-row" className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className={clsx(
                'w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0',
                s.blocked ? 'bg-danger-red/10 text-danger-red' : 'bg-primary-tint text-primary',
              )}>
                {s.blocked
                  ? <span className="material-symbols-outlined text-xl">block</span>
                  : (s.sender_name?.[0] || s.sender_uid[0])}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-navy truncate">{s.sender_name || s.sender_uid}</p>
                  {s.blocked && (
                    <span className="text-[10px] font-semibold text-danger-red bg-danger-red/10 rounded-pill px-2 py-0.5 shrink-0">
                      Đã chặn
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-caption text-neutral-gray">
                  <span>{s.active_rides} cuốc đang hiện</span>
                  <span>· {s.rides_7d} cuốc/7 ngày</span>
                  {s.reports > 0 && <span className="text-danger-red font-medium">· {s.reports} báo cáo</span>}
                </div>
              </div>
              {s.blocked ? (
                <button
                  data-testid="admin-sender-unblock"
                  onClick={() => unblockMutation.mutate(s.sender_uid)}
                  disabled={unblockMutation.isPending}
                  className="text-xs bg-success-green/10 text-success-green rounded-pill px-3 py-1.5 font-medium shrink-0"
                >
                  Bỏ chặn
                </button>
              ) : (
                <button
                  data-testid="admin-sender-block"
                  onClick={() => setBlockTarget(s)}
                  className="text-xs bg-danger-red text-white rounded-pill px-3 py-1.5 font-medium shrink-0"
                >
                  Chặn
                </button>
              )}
            </div>
          </div>
        ))}

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full mt-1 text-sm text-primary font-medium py-2"
          >
            {isFetchingNextPage ? 'Đang tải…' : 'Tải thêm'}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={!!blockTarget}
        title="Chặn người bắn này?"
        description="Mọi cuốc của họ sẽ biến khỏi tab Free của tất cả tài xế."
        confirmLabel="Chặn"
        loading={blockMutation.isPending}
        onConfirm={() => blockTarget && blockMutation.mutate(blockTarget.sender_uid)}
        onCancel={() => setBlockTarget(null)}
      />
    </div>
  )
}
