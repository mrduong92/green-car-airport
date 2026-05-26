import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotifications, readAll, markRead, type AppNotification } from '@/api/notifications'
import clsx from 'clsx'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'vừa xong'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

function NotificationItem({
  item,
  onRead,
}: {
  item: AppNotification
  onRead: (id: string, action: string | null, bookingId: number | null) => void
}) {
  const isUnread = !item.read_at
  return (
    <button
      onClick={() => onRead(item.id, item.action, item.booking_id)}
      className={clsx(
        'w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-border-gray transition-colors',
        isUnread ? 'bg-light-green' : 'bg-white',
      )}
    >
      <span
        className={clsx(
          'material-symbols-outlined text-[20px] mt-0.5 shrink-0',
          isUnread ? 'text-primary' : 'text-neutral-gray',
        )}
        style={{ fontVariationSettings: isUnread ? "'FILL' 1" : "'FILL' 0" }}
      >
        notifications
      </span>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm leading-snug', isUnread ? 'font-semibold text-navy' : 'font-medium text-navy')}>
          {item.title}
        </p>
        <p className="text-xs text-neutral-gray mt-0.5 leading-snug">{item.body}</p>
        <p className="text-[11px] text-neutral-dim mt-1">{timeAgo(item.created_at)}</p>
      </div>
      {isUnread && <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />}
    </button>
  )
}

export default function CustomerNotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => getNotifications(page),
  })

  const readAllMutation = useMutation({
    mutationFn: readAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })

  const handleRead = (id: string, action: string | null, bookingId: number | null) => {
    markReadMutation.mutate(id)
    if (action === 'view_booking' && bookingId) navigate(`/customer/booking/${bookingId}`)
  }

  const notifications = data?.data ?? []
  const hasUnread = notifications.some((n) => !n.read_at)

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray bg-white sticky top-0 z-10">
        <h1 className="text-base font-semibold text-navy">Thông báo</h1>
        {hasUnread && (
          <button
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
            className="text-xs text-primary font-medium"
          >
            Đọc tất cả
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <span className="material-symbols-outlined text-5xl text-border-gray mb-3">notifications</span>
          <p className="text-navy font-semibold text-sm">Chưa có thông báo nào</p>
          <p className="text-neutral-gray text-xs mt-1 text-center">Thông báo về chuyến đi sẽ hiện ở đây</p>
        </div>
      )}

      {notifications.map((item) => (
        <NotificationItem key={item.id} item={item} onRead={handleRead} />
      ))}

      {data && data.last_page > 1 && (
        <div className="flex justify-center gap-3 py-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 text-sm font-medium text-primary disabled:text-neutral-gray"
          >
            Trước
          </button>
          <span className="text-sm text-neutral-gray self-center">
            {page} / {data.last_page}
          </span>
          <button
            disabled={page >= data.last_page}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 text-sm font-medium text-primary disabled:text-neutral-gray"
          >
            Tiếp
          </button>
        </div>
      )}
    </div>
  )
}
