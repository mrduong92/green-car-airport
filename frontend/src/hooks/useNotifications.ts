import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUnreadCount } from '@/api/notifications'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

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

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        showToast(event.data.body ?? event.data.title ?? 'Thông báo mới', 'info')
        queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [showToast, queryClient])

  return { unreadCount }
}
