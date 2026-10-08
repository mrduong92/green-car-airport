import { useEffect, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getZaloGroups, setZaloGroupEnabled } from '@/api/adminFreeRides'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'

// Bộ lọc mặc định (key rỗng) chỉ gồm nhóm nick còn ở — nhóm đã rời xem ở "Nick đã rời".
const STATUS_FILTERS = [
  { key: '', label: 'Đang ở' },
  { key: 'enabled', label: 'Đang theo dõi' },
  { key: 'disabled', label: 'Đã tắt' },
  { key: 'left', label: 'Nick đã rời' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['key']

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const fmtLastMessage = (ms: number | null) => (ms == null ? 'Chưa có tin' : timeFmt.format(new Date(ms)))

const QUERY_ROOT = ['admin-zalo-groups'] as const

export default function GroupsTab() {
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')

  // Debounce 300ms: tránh gọi API mỗi ký tự gõ.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [...QUERY_ROOT, q, status],
    queryFn: ({ pageParam }) =>
      getZaloGroups({ q: q || undefined, status: status || undefined, page: pageParam }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  })

  const groups = data?.pages.flatMap((p) => p.data) ?? []

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setZaloGroupEnabled(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: QUERY_ROOT })
      const previous = qc.getQueriesData<{ pages: App.AdminPage<App.AdminZaloGroup>[] }>({ queryKey: QUERY_ROOT })
      qc.setQueriesData<{ pages: App.AdminPage<App.AdminZaloGroup>[] } | undefined>(
        { queryKey: QUERY_ROOT },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              data: p.data.map((g) => (g.zalo_group_id === id ? { ...g, enabled } : g)),
            })),
          },
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, prevData]) => qc.setQueryData(key, prevData))
      showToast('Cập nhật thất bại, đã hoàn tác', 'error')
    },
    // Thành công hay lỗi đều tải lại: danh sách theo bộ lọc (nhóm có thể đổi bộ lọc) + số "Nhóm đang bật" ở tab Tình trạng.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_ROOT })
      qc.invalidateQueries({ queryKey: ['admin-free-ride-status'] })
    },
  })

  return (
    <div className="flex flex-col gap-0">
      {/* Search + filter */}
      <div className="bg-white px-4 pt-4 pb-0 border-b border-border-gray">
        <div className="flex items-center gap-2 border border-border-gray rounded-input px-3 py-2 mb-3">
          <span className="material-symbols-outlined text-neutral-gray text-xl">search</span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo tên nhóm"
            className="flex-1 outline-none text-sm text-navy"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-3">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={clsx(
                'rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap',
                status === f.key ? 'bg-primary text-white' : 'bg-light-green text-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ghi chú cố định */}
      <div className="mx-4 mt-3 bg-light-green rounded-card px-3 py-2.5 flex items-start gap-2">
        <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">info</span>
        <p className="text-[12px] text-navy leading-snug">
          Muốn thêm nhóm: thêm nick phụ vào nhóm Zalo — hệ thống tự thấy trong ≤ 30 phút.
        </p>
      </div>

      <div className="flex flex-col px-4 py-4 gap-3">
        {isLoading && (
          <p className="text-caption text-neutral-gray text-center py-10">Đang tải…</p>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-10">
            <p className="text-sm text-danger-red text-center">Không tải được danh sách nhóm</p>
            <button onClick={() => refetch()} className="text-sm font-semibold text-primary">
              Thử lại
            </button>
          </div>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <EmptyState icon="groups" title="Không tìm thấy nhóm" description="Thử thay đổi từ khoá hoặc bộ lọc" />
        )}

        {groups.map((g) => (
          <div key={g.zalo_group_id} data-testid="admin-group-row" className="bg-white rounded-card shadow-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy truncate">
                  {g.name || g.zalo_group_id}
                  {g.left && (
                    <span className="ml-1.5 text-[10px] font-semibold text-danger-red bg-danger-red/10 rounded-pill px-2 py-0.5 align-middle">
                      Nick đã rời
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-caption text-neutral-gray">
                  <span>{g.member_count ?? '—'} thành viên</span>
                  <span>· {g.messages_24h} tin/24h</span>
                  <span>· {g.accounts.length} nick đang ở</span>
                </div>
                <p className="text-[11px] text-neutral-gray mt-1">Tin gần nhất: {fmtLastMessage(g.last_message_at)}</p>
              </div>
              <button
                data-testid="admin-group-toggle"
                onClick={() => toggleMutation.mutate({ id: g.zalo_group_id, enabled: !g.enabled })}
                disabled={toggleMutation.isPending}
                role="switch"
                aria-checked={g.enabled}
                className={clsx(
                  'relative w-[52px] h-[30px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none disabled:opacity-50',
                  g.enabled ? 'bg-success-green' : 'bg-neutral-gray/40',
                )}
              >
                <span
                  className={clsx(
                    'absolute top-[3px] w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200',
                    g.enabled ? 'left-[23px]' : 'left-[3px]',
                  )}
                />
              </button>
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
    </div>
  )
}
