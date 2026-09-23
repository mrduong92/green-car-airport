import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUnreadCount } from '@/api/notifications'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { syncPushSubscription } from '@/push'

export function useNotifications() {
  const queryClient = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const token = useAuthStore((s) => s.token)

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    enabled: !!token,
  })

  // Mỗi lần mở app (layout mount) đồng bộ lại subscription nếu quyền đã có —
  // token bị server xoá hay endpoint bị trình duyệt xoay đều được thay ở đây,
  // không phải đợi tới lần đăng nhập lại. Không bật hộp thoại xin quyền.
  useEffect(() => {
    if (token) syncPushSubscription()
  }, [token])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        showToast(event.data.body ?? event.data.title ?? 'Thông báo mới', 'info')
        queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        if (event.data.data?.action === 'view_trip') {
          queryClient.invalidateQueries({ queryKey: ['trips'] })
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [showToast, queryClient])

  return { unreadCount }
}
