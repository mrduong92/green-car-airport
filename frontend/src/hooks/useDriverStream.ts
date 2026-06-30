import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'

export function useDriverStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!enabled || !token) return

    let source: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      const url = `/api/driver/stream?token=${encodeURIComponent(token)}`
      source = new EventSource(url)

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'new_booking') {
            queryClient.invalidateQueries({ queryKey: ['trips'] })
          } else if (data.type === 'trip_taken') {
            // Optimistically remove the taken trip without a network call
            queryClient.setQueriesData<App.Trip[]>(
              { queryKey: ['trips'] },
              (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
            )
          } else if (data.type === 'booking_cancelled') {
            // Remove from available trips list (if still finding_driver)
            queryClient.setQueriesData<App.Trip[]>(
              { queryKey: ['trips'] },
              (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
            )
            // Refresh active trips in case driver had already accepted this booking
            queryClient.invalidateQueries({ queryKey: ['my-trips'] })
          } else if (data.type === 'connected') {
            // Sync on every (re)connect to catch anything missed while offline
            queryClient.invalidateQueries({ queryKey: ['trips'] })
          }
        } catch {
          // ignore malformed JSON
        }
      }

      source.onerror = () => {
        source.close()
        retryTimer = setTimeout(connect, 3_000)
      }
    }

    connect()

    return () => {
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [enabled, token, queryClient])
}
